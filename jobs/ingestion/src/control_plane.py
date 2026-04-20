from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import requests

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_S = 60


@dataclass
class WorkerRuntimeContext:
    mode: str
    run: dict[str, Any] | None = None
    runtime_bundle: dict[str, Any] | None = None
    config_path: Path | None = None


def _base_url() -> str:
    return os.environ.get("WORKER_CONTROL_BASE_URL", "").rstrip("/")


def _secret() -> str:
    return os.environ.get("WORKER_CONTROL_SECRET", "").strip()


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_secret()}",
        "Content-Type": "application/json",
    }


def _request_url(path: str) -> str:
    normalized = str(path).strip()
    if normalized.startswith(("http://", "https://")):
        return normalized
    return f"{_base_url()}{normalized}"


def _request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    response = requests.request(
        method,
        _request_url(path),
        headers=_headers(),
        json=payload,
        timeout=REQUEST_TIMEOUT_S,
    )
    response.raise_for_status()
    return response.json()


def is_enabled() -> bool:
    return bool(_base_url() and _secret())


def _runtime_dir() -> Path:
    directory = Path(os.environ.get("WORKER_RUNTIME_DIR", "/tmp/analytics-runtime"))
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _apply_runtime_env(job_key: str, runtime_bundle: dict[str, Any]) -> None:
    for entry in runtime_bundle.get(job_key, {}).get("env", []):
        name = str(entry.get("name", "")).strip()
        value = entry.get("value")
        if name and value is not None and not os.environ.get(name):
            os.environ[name] = str(value)


def _materialize_job_config(job_key: str, runtime_bundle: dict[str, Any]) -> Path:
    config_yaml = runtime_bundle.get(job_key, {}).get("configYaml", "")
    config_path = _runtime_dir() / f"{job_key}.job.yml"
    config_path.write_text(config_yaml, encoding="utf-8")
    os.environ["JOB_CONFIG_PATH"] = str(config_path)
    return config_path


def prepare_job_runtime(job_key: str, supported_run_types: Iterable[str]) -> WorkerRuntimeContext:
    if not is_enabled():
        return WorkerRuntimeContext(mode="disabled")

    run_id = os.environ.get("ANALYTICS_RUN_ID")
    if run_id:
        payload = _request("GET", f"/api/internal/runs/{run_id}")
    else:
        project_id = os.environ.get("ANALYTICS_PROJECT_ID")
        if not project_id:
            logger.info("worker control plane env is incomplete; falling back to local config")
            return WorkerRuntimeContext(mode="disabled")

        payload = _request(
            "POST",
            f"/api/internal/projects/{project_id}/claim-run",
            {
                "runTypes": list(supported_run_types),
                "message": f"{job_key} worker claimed this run.",
            },
        )

        if not payload.get("claimed"):
            logger.info("no queued runs for project=%s supported_run_types=%s", project_id, list(supported_run_types))
            return WorkerRuntimeContext(mode="idle")

    runtime_bundle = payload["runtimeBundle"]
    _apply_runtime_env(job_key, runtime_bundle)
    config_path = _materialize_job_config(job_key, runtime_bundle)

    run = payload.get("run")
    if run and run.get("id"):
        os.environ["ANALYTICS_RUN_ID"] = str(run["id"])

    return WorkerRuntimeContext(
        mode="attached",
        run=run,
        runtime_bundle=runtime_bundle,
        config_path=config_path,
    )


def patch_run_status(
    context: WorkerRuntimeContext,
    *,
    status: str,
    message: str,
    payload: dict[str, Any] | None = None,
    source_type: str | None = None,
    source_status: str | None = None,
) -> None:
    if context.mode != "attached" or not context.run:
        return

    run_id = context.run.get("id")
    if not run_id:
        return

    body: dict[str, Any] = {
        "status": status,
        "message": message,
    }
    if payload:
        body["payload"] = payload
    if source_type is not None:
        body["sourceType"] = source_type
    if source_status is not None:
        body["sourceStatus"] = source_status
    if status == "running":
        body["startedAt"] = context.run.get("startedAt")
    if status in {"succeeded", "failed"}:
        body["finishedAt"] = context.run.get("finishedAt")
    if status == "blocked":
        body["finishedAt"] = datetime.now(timezone.utc).isoformat()

    try:
        _request("PATCH", f"/api/internal/runs/{run_id}", body)
    except Exception as exc:  # noqa: BLE001
        logger.warning("failed to patch run status for %s: %s", run_id, exc)
