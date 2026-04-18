from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

UPSTREAM_MART_MODELS = (
    "mart_experiment_daily",
    "mart_cohort_daily",
    "mart_daily_active_users",
    "mart_funnel_daily",
    "mart_installs_funnel",
    "mart_revenue_metrics",
    "mart_session_metrics",
)


def _locate_dbt_project_dir() -> Path:
    search_roots = [Path.cwd(), *Path(__file__).resolve().parents]
    for root in search_roots:
        candidate = root / "dbt" / "dbt_project.yml"
        if candidate.exists():
            return candidate.parent

    raise FileNotFoundError("Could not find dbt/dbt_project.yml for the forecast transform step.")


def _dbt_executable() -> str:
    executable = shutil.which("dbt")
    if not executable:
        raise FileNotFoundError("dbt executable is not available in the forecast runtime image.")
    return executable


def _infer_project_slug(config: dict) -> str:
    explicit = str(config.get("project_slug", "")).strip()
    if explicit:
        return explicit

    experiment_daily_table = str(
        config.get("bigquery", {}).get("experiment_daily_table", "")
    ).strip()
    suffix = "_experiment_daily"
    if experiment_daily_table.endswith(suffix):
        return experiment_daily_table[: -len(suffix)].replace("_", "-")

    raise ValueError("Forecast config is missing project_slug and experiment_daily_table is not inferable.")


def _resolve_location(config: dict) -> str:
    location = (
        str(config.get("bigquery", {}).get("location", "")).strip()
        or os.environ.get("BQ_LOCATION", "").strip()
    )
    if location:
        return location.upper()

    region = str(config.get("provisioning", {}).get("region", "")).strip().lower()
    if region.startswith("europe-"):
        return "EU"

    return "US"


def _build_dbt_vars(config: dict) -> dict[str, str]:
    bigquery_cfg = config.get("bigquery", {})
    return {
        "project_slug": _infer_project_slug(config),
        "gcp_project_id": str(bigquery_cfg.get("project_id", "")).strip(),
        "raw_dataset": str(bigquery_cfg.get("raw_dataset", "raw")).strip() or "raw",
        "stg_dataset": str(bigquery_cfg.get("stg_dataset", "stg")).strip() or "stg",
        "mart_dataset": str(bigquery_cfg.get("mart_dataset", "mart")).strip() or "mart",
    }


def _build_profiles_payload(config: dict) -> dict[str, object]:
    dbt_vars = _build_dbt_vars(config)
    return {
        "client_analytics": {
            "target": "runtime",
            "outputs": {
                "runtime": {
                    "type": "bigquery",
                    "method": "oauth",
                    "project": dbt_vars["gcp_project_id"],
                    "dataset": dbt_vars["mart_dataset"],
                    "location": _resolve_location(config),
                    "priority": "interactive",
                    "threads": 4,
                }
            },
        }
    }


def _run_dbt_command(config: dict, *, select: list[str]) -> None:
    dbt_vars = _build_dbt_vars(config)
    if not dbt_vars["gcp_project_id"]:
        raise ValueError("Forecast dbt runtime requires bigquery.project_id in the generated config.")

    project_dir = _locate_dbt_project_dir()
    dbt_bin = _dbt_executable()

    with tempfile.TemporaryDirectory(prefix="analytics-dbt-") as profiles_dir:
        profiles_path = Path(profiles_dir) / "profiles.yml"
        profiles_path.write_text(
            yaml.safe_dump(_build_profiles_payload(config), sort_keys=False),
            encoding="utf-8",
        )

        command = [
            dbt_bin,
            "build",
            "--fail-fast",
            "--project-dir",
            str(project_dir),
            "--profiles-dir",
            profiles_dir,
            "--target",
            "runtime",
            "--vars",
            json.dumps(dbt_vars),
            "--select",
            *select,
        ]

        logger.info("running dbt command: %s", " ".join(command))
        subprocess.run(command, check=True)


def build_upstream_marts(config: dict) -> None:
    _run_dbt_command(config, select=[f"+{model}" for model in UPSTREAM_MART_MODELS])


def publish_forecast_serving_table(config: dict) -> None:
    _run_dbt_command(config, select=["mart_forecast_points"])
