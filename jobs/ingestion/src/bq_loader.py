"""
BigQuery load job utility.

Loads NDJSON files from GCS into raw/stg BigQuery tables.
Also maintains the meta.pipeline_runs health-check table.

Required env vars:
  GCP_PROJECT_ID  — destination GCP project.
  BQ_DATASET      — target dataset (default: "raw").
  GOOGLE_APPLICATION_CREDENTIALS — service account JSON path or Workload Identity.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)
_SUCCESSFUL_RUN_STATUSES = ("success", "skipped_existing", "skipped_empty")

# DDL for the health-check table (created if it does not exist)
_META_TABLE = "meta.pipeline_runs"
_META_DDL = """
CREATE TABLE IF NOT EXISTS `{project}.meta.pipeline_runs` (
    run_id          STRING    NOT NULL,
    job_name        STRING    NOT NULL,
    app_id          INT64,
    partition_date  DATE      NOT NULL,
    resource        STRING    NOT NULL,
    gcs_uri         STRING,
    rows_loaded     INT64,
    status          STRING    NOT NULL,
    started_at      TIMESTAMP NOT NULL,
    finished_at     TIMESTAMP,
    error_message   STRING
)
PARTITION BY partition_date
OPTIONS (require_partition_filter = FALSE)
"""

# BQ load job config for NDJSON → raw table
_LOAD_CONFIG = {
    "source_format": "NEWLINE_DELIMITED_JSON",
    "autodetect": False,
    "write_disposition": "WRITE_APPEND",
    "create_disposition": "CREATE_IF_NEEDED",
    "ignore_unknown_values": True,
    "max_bad_records": 10,
}

_APPMETRICA_RESOURCE_SCHEMAS = {
    "events": [
        ("event_name", "STRING"),
        ("event_datetime", "STRING"),
        ("appmetrica_device_id", "STRING"),
        ("profile_id", "STRING"),
        ("event_json", "STRING"),
        ("session_id", "STRING"),
        ("os_name", "STRING"),
        ("app_version_name", "STRING"),
        ("country_iso_code", "STRING"),
        ("city", "STRING"),
        ("application_id", "STRING"),
    ],
    "installations": [
        ("install_datetime", "STRING"),
        ("appmetrica_device_id", "STRING"),
        ("profile_id", "STRING"),
        ("tracker_name", "STRING"),
        ("country_iso_code", "STRING"),
        ("os_name", "STRING"),
        ("app_version_name", "STRING"),
    ],
    "sessions": [
        ("session_start_datetime", "STRING"),
        ("appmetrica_device_id", "STRING"),
        ("profile_id", "STRING"),
        ("session_id", "STRING"),
        ("duration_seconds", "STRING"),
        ("os_name", "STRING"),
        ("application_id", "STRING"),
    ],
}


class BQLoader:
    def __init__(
        self,
        project_id: str | None = None,
        dataset: str | None = None,
    ) -> None:
        self.project_id = project_id or os.environ.get("GCP_PROJECT_ID")
        self.dataset = dataset or os.environ.get("BQ_DATASET", "raw")

        if not self.project_id:
            logger.warning("GCP_PROJECT_ID not set — running in stub mode")
            self._bq = None
            self._client = None
            return

        try:
            from google.cloud import bigquery  # type: ignore[import-untyped]

            self._bq = bigquery
            self._client = bigquery.Client(project=self.project_id)
            self._ensure_meta_dataset()
            logger.info("BQLoader ready: project=%s dataset=%s", self.project_id, self.dataset)
        except ImportError:
            logger.error("google-cloud-bigquery not installed")
            raise

    def appmetrica_schema(self, resource: str):
        if self._client is None or self._bq is None:
            return None

        field_definitions = _APPMETRICA_RESOURCE_SCHEMAS.get(resource)
        if not field_definitions:
            raise ValueError(f"Unknown AppMetrica resource type: {resource}")

        return [
            self._bq.SchemaField(field_name, field_type)
            for field_name, field_type in field_definitions
        ]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def ensure_datasets(self, *dataset_names: str) -> None:
        if self._client is None:
            logger.info("stub ensure_datasets: %s (no credentials)", dataset_names)
            return

        for dataset_name in dataset_names:
            if not dataset_name:
                continue
            self._ensure_dataset(dataset_name)

    def load_from_gcs(
        self,
        gcs_uri: str,
        table: str,
        schema: list | None = None,
        partition_date: str | None = None,
    ) -> int:
        """
        Trigger a BigQuery load job from a GCS URI into a raw/stg table.

        Args:
            gcs_uri:        gs:// path produced by GCSUploader.upload_ndjson().
            table:          Destination table name, e.g. "appmetrica_events".
            schema:         Optional BigQuery SchemaField list. If None, uses
                            autodetect=True for the first load, then fixes schema.
            partition_date: If given (YYYY-MM-DD), the table is date-partitioned
                            and data is written to that partition.

        Returns:
            Number of rows loaded.

        Raises:
            google.cloud.exceptions.GoogleCloudError on load failure.
        """
        destination = f"{self.project_id}.{self.dataset}.{table}"

        if self._client is None:
            logger.info("stub load_from_gcs: %s → %s (no credentials)", gcs_uri, destination)
            return 0

        job_config = self._bq.LoadJobConfig(**_LOAD_CONFIG)
        if schema:
            job_config.schema = schema
            job_config.autodetect = False
        else:
            job_config.autodetect = True

        if partition_date:
            job_config.time_partitioning = self._bq.TimePartitioning(
                type_=self._bq.TimePartitioningType.DAY
            )
            destination = f"{destination}${partition_date.replace('-', '')}"

        dest_ref = self._bq.TableReference.from_string(destination)
        load_job = self._client.load_table_from_uri(
            gcs_uri,
            dest_ref,
            job_config=job_config,
        )
        logger.info("BQ load job started: %s → %s", gcs_uri, destination)

        load_job.result()  # blocks until complete

        dest_table = self._client.get_table(dest_ref)
        rows = load_job.output_rows
        logger.info(
            "BQ load done: %s → %s  rows_loaded=%d  total_rows=%d",
            gcs_uri, destination, rows, dest_table.num_rows,
        )
        return rows

    def record_run(
        self,
        run_id: str,
        job_name: str,
        app_id: int,
        partition_date: str,
        resource: str,
        gcs_uri: str,
        rows_loaded: int,
        status: str,
        started_at: datetime,
        error_message: str | None = None,
    ) -> None:
        """
        Insert a row into meta.pipeline_runs for observability.

        Args:
            run_id:         Unique run identifier (e.g. ISO timestamp + app_id).
            job_name:       Name of the pipeline job (e.g. "appmetrica_events").
            app_id:         AppMetrica application ID.
            partition_date: The date being ingested (YYYY-MM-DD).
            resource:       AppMetrica resource type ("events", "installations", "sessions").
            gcs_uri:        GCS path where data was staged.
            rows_loaded:    Number of rows written to BQ.
            status:         "success" or "error".
            started_at:     Job start timestamp (UTC).
            error_message:  Error details if status == "error".
        """
        if self._client is None:
            logger.info(
                "stub record_run: run_id=%s status=%s rows=%d (no credentials)",
                run_id, status, rows_loaded,
            )
            return

        row = {
            "run_id": run_id,
            "job_name": job_name,
            "app_id": app_id,
            "partition_date": partition_date,
            "resource": resource,
            "gcs_uri": gcs_uri,
            "rows_loaded": rows_loaded,
            "status": status,
            "started_at": started_at.isoformat(),
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "error_message": error_message,
        }

        table_ref = f"{self.project_id}.meta.pipeline_runs"
        errors = self._client.insert_rows_json(table_ref, [row])
        if errors:
            logger.error("Failed to write meta.pipeline_runs: %s", errors)
        else:
            logger.info("meta.pipeline_runs: recorded run_id=%s status=%s", run_id, status)

    def has_successful_slice(
        self,
        *,
        job_name: str,
        app_id: int,
        partition_date: str,
        resource: str,
    ) -> bool:
        if self._client is None:
            return False

        query = f"""
            SELECT 1
            FROM `{self.project_id}.meta.pipeline_runs`
            WHERE job_name = @job_name
              AND app_id = @app_id
              AND partition_date = @partition_date
              AND resource = @resource
              AND status IN UNNEST(@statuses)
            ORDER BY finished_at DESC
            LIMIT 1
        """
        job_config = self._bq.QueryJobConfig(
            query_parameters=[
                self._bq.ScalarQueryParameter("job_name", "STRING", job_name),
                self._bq.ScalarQueryParameter("app_id", "INT64", app_id),
                self._bq.ScalarQueryParameter("partition_date", "DATE", partition_date),
                self._bq.ScalarQueryParameter("resource", "STRING", resource),
                self._bq.ArrayQueryParameter("statuses", "STRING", list(_SUCCESSFUL_RUN_STATUSES)),
            ]
        )
        result = self._client.query(query, job_config=job_config).result()
        return next(iter(result), None) is not None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ensure_meta_dataset(self) -> None:
        """Create the meta dataset and pipeline_runs table if they don't exist."""
        self._ensure_dataset("meta")

        ddl = _META_DDL.format(project=self.project_id)
        self._client.query(ddl).result()
        logger.info("Ensured meta.pipeline_runs table exists")

    def _ensure_dataset(self, dataset_name: str) -> None:
        from google.cloud.exceptions import NotFound  # type: ignore[import-untyped]

        dataset_ref = f"{self.project_id}.{dataset_name}"
        try:
            self._client.get_dataset(dataset_ref)
        except NotFound:
            dataset = self._bq.Dataset(dataset_ref)
            dataset.location = os.environ.get("BQ_LOCATION", "EU")
            self._client.create_dataset(dataset, exists_ok=True)
            logger.info("Created BQ dataset: %s", dataset_ref)
