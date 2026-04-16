"""
AppMetrica Logs API → GCS → BigQuery ingestion job.
Entry point for Cloud Run Job execution.

Pipeline per app_id per resource:
  1. Fetch data from AppMetrica Logs API (with polling + retry)
  2. Stream rows as NDJSON to GCS staging bucket
  3. Load GCS blob into BigQuery raw table (date-partitioned)
  4. Record run in meta.pipeline_runs

Idempotency: skips GCS upload if the blob already exists (re-runs are safe).

Required env vars:
  APPMETRICA_TOKEN              — AppMetrica OAuth token
  GCP_PROJECT_ID                — GCP project ID
  GCS_BUCKET                    — GCS staging bucket
  GOOGLE_APPLICATION_CREDENTIALS — path to service account JSON (or Workload Identity)

Optional env vars:
  JOB_CONFIG_PATH — path to job_config.yml (default: config/job_config.example.yml)
  INGEST_DATE     — override ingestion date YYYY-MM-DD (default: yesterday)
  BQ_DATASET      — BigQuery raw dataset (default: raw)
  BQ_LOCATION     — BigQuery dataset location (default: EU)
"""

from __future__ import annotations

import logging
import os
import sys
import uuid
import yaml
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from src.control_plane import patch_run_status, prepare_job_runtime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("ingestion")


def load_config() -> dict:
    config_path = Path(os.environ.get("JOB_CONFIG_PATH", "config/job_config.example.yml"))
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")
    with open(config_path) as f:
        return yaml.safe_load(f)


def resolve_ingest_date(config: dict) -> str:
    """Return the date to ingest. Env var INGEST_DATE overrides D-1 default."""
    override = os.environ.get("INGEST_DATE")
    if override:
        return override
    lookback = config.get("appmetrica", {}).get("lookback_days", 1)
    return (date.today() - timedelta(days=lookback)).isoformat()


def resolve_ingest_dates(config: dict, runtime_context) -> list[str]:
    if runtime_context.mode == "attached" and runtime_context.run:
        run = runtime_context.run
        run_type = str(run.get("runType", "ingestion"))
        window_from = run.get("windowFrom")
        window_to = run.get("windowTo")
        if isinstance(window_from, str) and isinstance(window_to, str):
            start = date.fromisoformat(window_from)
            end = date.fromisoformat(window_to)
        elif run_type == "backfill":
            lookback_days = int(config.get("appmetrica", {}).get("lookback_days", 1))
            backfill_days = int(config.get("schedule", {}).get("initial_backfill_days", 1))
            end = date.today() - timedelta(days=lookback_days)
            start = end - timedelta(days=max(backfill_days - 1, 0))
        else:
            return [resolve_ingest_date(config)]

        if start > end:
            start, end = end, start

        return [
            (start + timedelta(days=offset)).isoformat()
            for offset in range((end - start).days + 1)
        ]

    return [resolve_ingest_date(config)]


def normalize_app_ids(raw_app_ids: list[object]) -> list[int]:
    app_ids: list[int] = []
    for value in raw_app_ids:
        try:
            app_ids.append(int(value))
        except (TypeError, ValueError):
            logger.warning("skipping invalid AppMetrica app id from config: %s", value)
    return app_ids


def ensure_runtime_infrastructure(config: dict, uploader, loader) -> None:
    provisioning = config.get("provisioning", {})
    if not provisioning.get("auto_create_infrastructure", False):
        return

    region = str(provisioning.get("region", os.environ.get("BQ_LOCATION", "EU")))
    datasets = provisioning.get("datasets", {})
    uploader.ensure_bucket(location=region)
    loader.ensure_datasets(
        str(datasets.get("raw", "")),
        str(datasets.get("stg", "")),
        str(datasets.get("mart", "")),
    )


def ingest_resource(
    *,
    client,
    uploader,
    loader,
    app_id: int,
    ingest_date: str,
    resource: str,
    gcs_prefix: str,
    bq_table: str,
    event_names: list[str] | None = None,
    run_id_prefix: str,
) -> None:
    """
    Run the full extract → stage → load cycle for one app_id + resource.

    Idempotency: if the GCS blob already exists, the upload is skipped
    and the BQ load is re-attempted (BQ WRITE_APPEND is idempotent for
    date-partitioned tables when the partition is first truncated — see notes).
    """
    started_at = datetime.now(timezone.utc)
    run_id = f"{run_id_prefix}/{resource}/{app_id}/{ingest_date}"
    blob_path = f"{gcs_prefix}/{app_id}/{ingest_date}/{resource}.ndjson"
    gcs_uri = f"gs://{uploader.bucket}/{blob_path}"

    rows_loaded = 0
    status = "success"
    error_message = None

    try:
        # --- 1. Fetch from AppMetrica ---
        logger.info("[%s] fetching %s for app_id=%s date=%s", run_id, resource, app_id, ingest_date)

        if resource == "events":
            rows = client.fetch_events(
                app_id=app_id,
                date_from=ingest_date,
                date_to=ingest_date,
                event_names=event_names or [],
            )
        elif resource == "installations":
            rows = client.fetch_installs(app_id=app_id, date_from=ingest_date, date_to=ingest_date)
        elif resource == "sessions":
            rows = client.fetch_sessions(app_id=app_id, date_from=ingest_date, date_to=ingest_date)
        else:
            raise ValueError(f"Unknown resource type: {resource}")

        # --- 2. Upload to GCS (idempotency check) ---
        if uploader.blob_exists(blob_path):
            logger.info("[%s] GCS blob already exists — skipping upload: %s", run_id, gcs_uri)
        else:
            gcs_uri = uploader.upload_ndjson(rows=rows, blob_path=blob_path)

        # --- 3. Load into BigQuery ---
        rows_loaded = loader.load_from_gcs(
            gcs_uri=gcs_uri,
            table=bq_table,
            partition_date=ingest_date,
        )

    except Exception as exc:
        status = "error"
        error_message = str(exc)
        logger.exception("[%s] ingestion failed: %s", run_id, exc)
        raise

    finally:
        # --- 4. Health check record ---
        loader.record_run(
            run_id=run_id,
            job_name="appmetrica_ingestion",
            app_id=app_id,
            partition_date=ingest_date,
            resource=resource,
            gcs_uri=gcs_uri,
            rows_loaded=rows_loaded,
            status=status,
            started_at=started_at,
            error_message=error_message,
        )


def main() -> None:
    logger.info("=== AppMetrica ingestion job start ===")

    runtime_context = prepare_job_runtime("ingestion", ("backfill", "ingestion"))
    if runtime_context.mode == "idle":
        logger.info("no queued ingestion/backfill runs were available")
        return

    patch_run_status(
        runtime_context,
        status="running",
        message="Ingestion worker is preparing AppMetrica extraction.",
    )

    try:
        config = load_config()
        ingest_dates = resolve_ingest_dates(config, runtime_context)
        run_id_prefix = (
            str(runtime_context.run.get("id", ""))[:8]
            if runtime_context.mode == "attached" and runtime_context.run
            else str(uuid.uuid4())[:8]
        )

        app_ids = normalize_app_ids(config.get("appmetrica", {}).get("app_ids", []))
        event_names: list[str] = config.get("appmetrica", {}).get("event_names", [])
        gcs_prefix: str = config.get("gcs", {}).get("prefix", "raw/appmetrica")
        bigquery_cfg = config.get("bigquery", {})
        events_table = str(bigquery_cfg.get("events_table", "appmetrica_events"))
        installs_table = str(bigquery_cfg.get("installs_table", "appmetrica_installs"))
        sessions_table = str(bigquery_cfg.get("sessions_table", "appmetrica_sessions"))

        logger.info(
            "config: app_ids=%s ingest_dates=%s gcs_prefix=%s",
            app_ids,
            ingest_dates,
            gcs_prefix,
        )

        if not app_ids:
            message = "No valid AppMetrica app ids are configured; ingestion exited without work."
            logger.info(message)
            patch_run_status(
                runtime_context,
                status="succeeded",
                message=message,
                payload={"processedDates": ingest_dates, "appIds": []},
            )
            return

        from src.appmetrica_client import AppMetricaClient
        from src.gcs_uploader import GCSUploader
        from src.bq_loader import BQLoader

        client = AppMetricaClient()
        uploader = GCSUploader()
        loader = BQLoader()
        ensure_runtime_infrastructure(config, uploader, loader)

        failed: list[str] = []

        for ingest_date in ingest_dates:
            for app_id in app_ids:
                for resource, bq_table in [
                    ("events", events_table),
                    ("installations", installs_table),
                    ("sessions", sessions_table),
                ]:
                    try:
                        ingest_resource(
                            client=client,
                            uploader=uploader,
                            loader=loader,
                            app_id=app_id,
                            ingest_date=ingest_date,
                            resource=resource,
                            gcs_prefix=gcs_prefix,
                            bq_table=bq_table,
                            event_names=event_names if resource == "events" else None,
                            run_id_prefix=run_id_prefix,
                        )
                    except Exception:
                        failed.append(f"{app_id}/{resource}/{ingest_date}")

        if failed:
            logger.error("=== ingestion FAILED for: %s ===", failed)
            patch_run_status(
                runtime_context,
                status="failed",
                message=f"Ingestion failed for {len(failed)} app/resource slices.",
                payload={"processedDates": ingest_dates, "failedSlices": failed},
                source_type="appmetrica_logs",
                source_status="error",
            )
            sys.exit(1)

        logger.info("=== AppMetrica ingestion job complete: dates=%s apps=%s ===", ingest_dates, app_ids)
        patch_run_status(
            runtime_context,
            status="succeeded",
            message=f"Ingestion completed for {len(ingest_dates)} date window(s).",
            payload={"processedDates": ingest_dates, "appIds": app_ids, "gcsPrefix": gcs_prefix},
            source_type="appmetrica_logs",
            source_status="ready",
        )
    except Exception as exc:
        patch_run_status(
            runtime_context,
            status="failed",
            message=f"Ingestion worker crashed: {exc}",
            payload={"error": str(exc)},
            source_type="appmetrica_logs",
            source_status="error",
        )
        raise


if __name__ == "__main__":
    main()
