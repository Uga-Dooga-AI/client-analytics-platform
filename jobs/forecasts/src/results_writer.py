"""
Forecast output writer.

Writes forecast points to BigQuery when credentials are present and always
publishes a lightweight manifest either to GCS or to a local runtime folder.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import pandas as pd

logger = logging.getLogger(__name__)

FORECAST_TABLE = "mart_forecast_points"


class ResultsWriter:
    def __init__(
        self,
        project_id: str | None = None,
        mart_dataset: str | None = None,
        forecast_table: str | None = None,
        bounds_bucket: str | None = None,
        bounds_prefix: str | None = None,
    ) -> None:
        self.project_id = project_id or os.environ.get("GCP_PROJECT_ID")
        self.mart_dataset = mart_dataset or os.environ.get("BQ_MART_DATASET", "mart")
        self.forecast_table = forecast_table or os.environ.get("BQ_FORECAST_TABLE", FORECAST_TABLE)
        self.bounds_bucket = bounds_bucket or os.environ.get("BOUNDS_BUCKET")
        self.bounds_prefix = (bounds_prefix or os.environ.get("BOUNDS_PREFIX") or "").strip("/")

        self._bq = None
        self._bq_client = None
        if self.project_id:
            try:
                from google.cloud import bigquery  # type: ignore[import-untyped]

                self._bq = bigquery
                self._bq_client = bigquery.Client(project=self.project_id)
            except ImportError:
                logger.warning("google-cloud-bigquery not installed — forecast writes stay local")

        self._storage_client = None
        if self.project_id and self.bounds_bucket:
            try:
                from google.cloud import storage  # type: ignore[import-untyped]

                self._storage_client = storage.Client(project=self.project_id)
            except ImportError:
                logger.warning("google-cloud-storage not installed — bounds manifest stays local")

    def write_forecast(self, df: "pd.DataFrame", run_date: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        output_dir = Path(os.environ.get("FORECAST_OUTPUT_DIR", "/tmp/analytics-runtime"))
        output_dir.mkdir(parents=True, exist_ok=True)

        result: dict[str, Any] = {
            "rowCount": int(len(df.index)),
            "runDate": run_date,
            "bigQueryTable": None,
            "csvPath": None,
            "manifestPath": None,
        }

        if df.empty:
            manifest_path = self._publish_manifest(
                {
                    "runDate": run_date,
                    "rowCount": 0,
                    "note": "No forecast points were produced.",
                    **(metadata or {}),
                },
                output_dir=output_dir,
                manifest_kind="forecast",
            )
            result["manifestPath"] = manifest_path
            return result

        if self._bq_client is not None:
            destination = f"{self.project_id}.{self.mart_dataset}.{self.forecast_table}"
            job_config = self._bq.LoadJobConfig(
                write_disposition="WRITE_APPEND",
                create_disposition="CREATE_IF_NEEDED",
            )
            self._bq_client.load_table_from_dataframe(df, destination, job_config=job_config).result()
            result["bigQueryTable"] = destination
            logger.info("forecast output appended to %s (%d rows)", destination, len(df.index))
        else:
            csv_path = output_dir / f"forecast-points-{run_date}.csv"
            df.to_csv(csv_path, index=False)
            result["csvPath"] = str(csv_path)
            logger.info("forecast output saved locally: %s", csv_path)

        manifest_payload = {
            "runDate": run_date,
            "rowCount": int(len(df.index)),
            "metrics": sorted(df["metric"].dropna().astype(str).unique().tolist()),
            "dateRange": {
                "from": str(df["date"].min()),
                "to": str(df["date"].max()),
            },
            **(metadata or {}),
        }
        result["manifestPath"] = self._publish_manifest(
            manifest_payload,
            output_dir=output_dir,
            manifest_kind="forecast",
        )
        return result

    def write_bounds_artifacts(
        self,
        artifacts: dict[int, bytes],
        run_date: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        output_dir = Path(os.environ.get("FORECAST_OUTPUT_DIR", "/tmp/analytics-runtime"))
        output_dir.mkdir(parents=True, exist_ok=True)

        artifact_count = len(artifacts)
        result: dict[str, Any] = {
            "runDate": run_date,
            "artifactCount": artifact_count,
            "artifactBasePath": None,
            "manifestPath": None,
            "deletedArtifactCount": 0,
        }

        if artifact_count == 0:
            manifest_payload = {
                "runDate": run_date,
                "artifactCount": 0,
                "note": "No bounds artifacts were produced.",
                **(metadata or {}),
            }
            result["manifestPath"] = self._publish_manifest(
                manifest_payload,
                output_dir=output_dir,
                manifest_kind="bounds",
            )
            return result

        if self._storage_client is not None and self.bounds_bucket:
            bucket = self._storage_client.bucket(self.bounds_bucket)
            desired_object_names = {
                f"{self.bounds_prefix}/{cohort_size}.pkl"
                if self.bounds_prefix
                else f"{cohort_size}.pkl"
                for cohort_size in artifacts
            }
            existing_prefix = f"{self.bounds_prefix}/" if self.bounds_prefix else ""
            deleted_count = 0
            for blob in bucket.list_blobs(prefix=existing_prefix):
                if not blob.name.endswith(".pkl"):
                    continue
                if blob.name in desired_object_names:
                    continue
                blob.delete()
                deleted_count += 1
            for cohort_size, payload in artifacts.items():
                object_name = (
                    f"{self.bounds_prefix}/{cohort_size}.pkl"
                    if self.bounds_prefix
                    else f"{cohort_size}.pkl"
                )
                bucket.blob(object_name).upload_from_string(
                    payload,
                    content_type="application/octet-stream",
                )
            result["artifactBasePath"] = (
                f"gs://{self.bounds_bucket}/{self.bounds_prefix}"
                if self.bounds_prefix
                else f"gs://{self.bounds_bucket}"
            )
            result["deletedArtifactCount"] = deleted_count
            logger.info(
                "bounds artifacts uploaded: bucket=%s prefix=%s count=%d deleted=%d",
                self.bounds_bucket,
                self.bounds_prefix or "/",
                artifact_count,
                deleted_count,
            )
        else:
            bounds_dir = output_dir / (self.bounds_prefix or "bounds-artifacts")
            bounds_dir.mkdir(parents=True, exist_ok=True)
            deleted_count = 0
            for artifact_path in bounds_dir.glob("*.pkl"):
                if artifact_path.name not in {f"{cohort_size}.pkl" for cohort_size in artifacts}:
                    artifact_path.unlink()
                    deleted_count += 1
            for cohort_size, payload in artifacts.items():
                artifact_path = bounds_dir / f"{cohort_size}.pkl"
                artifact_path.write_bytes(payload)
            result["artifactBasePath"] = str(bounds_dir)
            result["deletedArtifactCount"] = deleted_count
            logger.info(
                "bounds artifacts saved locally: %s (%d files, deleted=%d)",
                bounds_dir,
                artifact_count,
                deleted_count,
            )

        manifest_payload = {
            "runDate": run_date,
            "artifactCount": artifact_count,
            "artifactBasePath": result["artifactBasePath"],
            **(metadata or {}),
        }
        result["manifestPath"] = self._publish_manifest(
            manifest_payload,
            output_dir=output_dir,
            manifest_kind="bounds",
        )
        return result

    def _publish_manifest(
        self,
        payload: dict[str, Any],
        output_dir: Path,
        *,
        manifest_kind: str,
    ) -> str:
        manifest_json = json.dumps(payload, ensure_ascii=False, indent=2, default=str)

        if self._storage_client is not None and self.bounds_bucket:
            bucket = self._storage_client.bucket(self.bounds_bucket)
            base_prefix = (
                f"{self.bounds_prefix}/manifests/{manifest_kind}"
                if self.bounds_prefix
                else f"manifests/{manifest_kind}"
            )
            manifest_name = f"{base_prefix}/{payload['runDate']}.json"
            latest_name = (
                f"{self.bounds_prefix}/{manifest_kind}-latest.json"
                if self.bounds_prefix
                else f"{manifest_kind}-latest.json"
            )

            bucket.blob(manifest_name).upload_from_string(manifest_json, content_type="application/json")
            bucket.blob(latest_name).upload_from_string(manifest_json, content_type="application/json")
            logger.info("bounds manifest uploaded: gs://%s/%s", self.bounds_bucket, manifest_name)
            return f"gs://{self.bounds_bucket}/{manifest_name}"

        manifest_path = output_dir / f"{manifest_kind}-manifest-{payload['runDate']}.json"
        manifest_path.write_text(manifest_json, encoding="utf-8")
        logger.info("bounds manifest saved locally: %s", manifest_path)
        return str(manifest_path)
