"""
BigQuery mart → forecast engine → output writer job.

This worker can run in two modes:
  - local/manual mode from a static config file
  - control-plane mode where it claims a queued run and materializes config
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import yaml

from src.control_plane import (
    list_hot_forecast_combinations,
    patch_run_status,
    prepare_job_runtime,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("forecasts")


def load_config() -> dict:
    config_path = Path(os.environ.get("JOB_CONFIG_PATH", "config/job_config.example.yml"))
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")
    with open(config_path) as f:
        return yaml.safe_load(f)


def resolve_history_window(config: dict, runtime_context) -> tuple[str, str]:
    forecast_cfg = config.get("forecast", {})
    min_history_days = int(forecast_cfg.get("min_history_days", 14))
    horizon_days = int(forecast_cfg.get("horizon_days", 30))
    max_history_days = max(min_history_days * 4, horizon_days, 120)
    date_to = date.today().isoformat()
    date_from = (date.today() - timedelta(days=max_history_days)).isoformat()

    if runtime_context.mode == "attached" and runtime_context.run:
        run = runtime_context.run
        if isinstance(run.get("windowFrom"), str):
            date_from = run["windowFrom"]
        if isinstance(run.get("windowTo"), str):
            date_to = run["windowTo"]

    return date_from, date_to


def resolve_metric_list(config: dict) -> list[str]:
    forecast_cfg = config.get("forecast", {})
    metrics = forecast_cfg.get("metrics")
    if isinstance(metrics, list):
        return [str(metric).strip() for metric in metrics if str(metric).strip()]
    return ["revenue", "exposures", "activations"]


def resolve_hot_combination_limit(config: dict) -> int:
    forecast_cfg = config.get("forecast", {})
    strategy = forecast_cfg.get("strategy", {})
    if isinstance(strategy, dict):
        value = strategy.get("recentCombinationLimit")
        if isinstance(value, (int, float)):
            return max(1, min(100, int(value)))
    return 50


def resolve_prewarm_plan(config: dict) -> dict:
    forecast_cfg = config.get("forecast", {})
    plan = forecast_cfg.get("prewarm_plan")
    if isinstance(plan, dict):
        return plan
    return {}


def main() -> None:
    logger.info("=== forecast job start ===")
    runtime_context = prepare_job_runtime("forecasts", ("bounds_refresh", "forecast"))
    if runtime_context.mode == "idle":
        logger.info("no queued forecast/bounds runs were available")
        return

    patch_run_status(
        runtime_context,
        status="running",
        message="Forecast worker is preparing mart inputs.",
        source_type="bounds_artifacts",
        source_status="syncing",
    )

    try:
        config = load_config()
        bigquery_cfg = config.get("bigquery", {})
        forecast_cfg = config.get("forecast", {})
        date_from, date_to = resolve_history_window(config, runtime_context)
        run_type = (
            str(runtime_context.run.get("runType", "forecast"))
            if runtime_context.mode == "attached" and runtime_context.run
            else "forecast"
        )
        metrics = resolve_metric_list(config)
        prewarm_plan = resolve_prewarm_plan(config)
        hot_combinations = list_hot_forecast_combinations(
            runtime_context, limit=resolve_hot_combination_limit(config)
        )

        logger.info(
            "config loaded: project=%s mart=%s metrics=%s range=%s..%s hot_combinations=%s prewarm_estimate=%s",
            bigquery_cfg.get("project_id"),
            bigquery_cfg.get("mart_dataset"),
            metrics,
            date_from,
            date_to,
            len(hot_combinations),
            prewarm_plan.get("estimatedCombinationCount"),
        )

        if run_type == "bounds_refresh":
            from src.dbt_runner import build_upstream_marts

            build_upstream_marts(config)
            message = (
                "Bounds refresh rebuilt project-scoped marts without recomputing forecasts. "
                "Forecast execution still owns the actual p10/p50/p90 materialization."
            )
            logger.info(message)
            patch_run_status(
                runtime_context,
                status="succeeded",
                message=message,
                payload={
                    "sourceRange": {"from": date_from, "to": date_to},
                    "hotCombinations": hot_combinations,
                    "prewarmPlan": prewarm_plan,
                    "executionMode": "bounds_refresh_transform",
                },
            )
            return

        from src.dbt_runner import publish_forecast_serving_table
        from src.forecast_engine import ForecastEngine
        from src.mart_reader import MartReader
        from src.results_writer import ResultsWriter

        reader = MartReader(
            project_id=bigquery_cfg.get("project_id"),
            mart_dataset=bigquery_cfg.get("mart_dataset"),
            experiment_daily_table=bigquery_cfg.get("experiment_daily_table"),
        )
        writer = ResultsWriter(
            project_id=bigquery_cfg.get("project_id"),
            mart_dataset=bigquery_cfg.get("mart_dataset"),
            forecast_table=bigquery_cfg.get("forecast_table"),
            bounds_bucket=forecast_cfg.get("bounds_bucket"),
            bounds_prefix=forecast_cfg.get("bounds_prefix"),
        )
        engine = ForecastEngine(
            horizon_days=int(forecast_cfg.get("horizon_days", 30)),
            confidence_interval=float(forecast_cfg.get("confidence_interval", 0.8)),
            min_history_days=int(forecast_cfg.get("min_history_days", 14)),
            engine=str(forecast_cfg.get("engine", "auto")),
        )

        source_df = reader.read_experiment_daily(date_from, date_to, metrics)
        if source_df.empty:
            message = "No source rows were returned for the requested history window."
            logger.info(message)
            output = writer.write_forecast(
                source_df,
                run_date=date.today().isoformat(),
                metadata={"sourceRange": {"from": date_from, "to": date_to}, "metrics": metrics},
            )
            patch_run_status(
                runtime_context,
                status="succeeded",
                message=message,
                payload={
                    "sourceRange": {"from": date_from, "to": date_to},
                    "hotCombinations": hot_combinations,
                    "prewarmPlan": prewarm_plan,
                    "output": output,
                },
                source_type="bounds_artifacts",
                source_status="ready",
            )
            return

        run_id = (
            str(runtime_context.run.get("id"))
            if runtime_context.mode == "attached" and runtime_context.run and runtime_context.run.get("id")
            else None
        )
        forecast_df = engine.forecast(source_df, run_id=run_id)
        output = writer.write_forecast(
            forecast_df,
            run_date=date.today().isoformat(),
            metadata={
                "sourceRange": {"from": date_from, "to": date_to},
                "sourceRows": int(len(source_df.index)),
                "metrics": metrics,
                "hotCombinations": hot_combinations,
                "prewarmPlan": prewarm_plan,
            },
        )
        publish_forecast_serving_table(config)

        message = f"Forecast job completed for {len(metrics)} metric(s)."
        logger.info(message)
        patch_run_status(
            runtime_context,
            status="succeeded",
            message=message,
            payload={
                "sourceRange": {"from": date_from, "to": date_to},
                "sourceRows": int(len(source_df.index)),
                "forecastRows": int(len(forecast_df.index)),
                "hotCombinationCount": len(hot_combinations),
                "hotCombinations": hot_combinations,
                "prewarmPlan": prewarm_plan,
                "output": output,
            },
            source_type="bounds_artifacts",
            source_status="ready",
        )
    except Exception as exc:  # noqa: BLE001
        patch_run_status(
            runtime_context,
            status="failed",
            message=f"Forecast worker crashed: {exc}",
            payload={"error": str(exc)},
            source_type="bounds_artifacts",
            source_status="error",
        )
        raise


if __name__ == "__main__":
    main()
