"""
BigQuery load job utility stub.

Real implementation requires:
  - GCP_PROJECT_ID env var
  - BQ_DATASET env var (raw or stg layer)
  - Google Application Default Credentials
"""

import logging
import os

logger = logging.getLogger(__name__)


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

    def load_from_gcs(self, gcs_uri: str, table: str) -> None:
        """
        Trigger a BigQuery load job from a GCS URI into a raw/stg table.

        Stub: logs and returns without performing I/O. Real implementation will
        call bigquery.Client().load_table_from_uri() and wait for completion.

        Args:
            gcs_uri: gs:// path returned by GCSUploader.upload_ndjson()
            table:   destination table name, e.g. "appmetrica_events"
        """
        destination = f"{self.project_id}.{self.dataset}.{table}"
        logger.info("stub load_from_gcs: %s → %s", gcs_uri, destination)
        # TODO: implement after BigQuery source projects confirmed (UGAA-1167)
