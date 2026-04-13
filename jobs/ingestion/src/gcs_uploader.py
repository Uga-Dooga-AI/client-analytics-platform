"""
Google Cloud Storage upload utility stub.

Real implementation requires:
  - GCP_PROJECT_ID env var
  - GCS_BUCKET env var
  - Google Application Default Credentials (service account JSON or Workload Identity)
"""

import logging
import os
from typing import Iterable

logger = logging.getLogger(__name__)


class GCSUploader:
    def __init__(
        self,
        project_id: str | None = None,
        bucket: str | None = None,
    ) -> None:
        self.project_id = project_id or os.environ.get("GCP_PROJECT_ID")
        self.bucket = bucket or os.environ.get("GCS_BUCKET")
        if not self.project_id or not self.bucket:
            logger.warning("GCP_PROJECT_ID / GCS_BUCKET not set — running in stub mode")

    def upload_ndjson(self, rows: Iterable[dict], blob_path: str) -> str:
        """
        Upload an iterable of dicts as newline-delimited JSON to GCS.

        Stub: logs and returns a placeholder URI. Real implementation will
        stream rows → NDJSON → GCS blob and return gs:// URI.

        Args:
            rows: iterable of event dicts
            blob_path: destination path inside bucket, e.g. "raw/events/2024-01-01.ndjson"

        Returns:
            gs:// URI of uploaded blob
        """
        logger.info("stub upload_ndjson: bucket=%s blob=%s", self.bucket, blob_path)
        # TODO: implement after GCS_BUCKET is confirmed (UGAA-1167)
        return f"gs://{self.bucket}/{blob_path}"
