"""
Google Cloud Storage upload utility.

Streams an iterable of dicts as newline-delimited JSON (NDJSON) directly to GCS.

Required env vars:
  GCP_PROJECT_ID  — GCP project containing the GCS bucket.
  GCS_BUCKET      — destination bucket name.
  GOOGLE_APPLICATION_CREDENTIALS — path to service account JSON
                                   (or use Workload Identity on Cloud Run).
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
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
            self._client = None
            return

        try:
            from google.cloud import storage  # type: ignore[import-untyped]

            self._client = storage.Client(project=self.project_id)
            self._bucket_obj = self._client.bucket(self.bucket)
            logger.info("GCSUploader ready: gs://%s (project=%s)", self.bucket, self.project_id)
        except ImportError:
            logger.error("google-cloud-storage not installed")
            raise

    def ensure_bucket(self, *, location: str = "EU", storage_class: str = "STANDARD") -> None:
        if self._client is None:
            logger.info("stub ensure_bucket: gs://%s (no credentials)", self.bucket)
            return

        if self._bucket_obj.exists():
            return

        self._bucket_obj.storage_class = storage_class
        self._client.create_bucket(self._bucket_obj, location=location)
        logger.info(
            "created GCS bucket: gs://%s (location=%s storage_class=%s)",
            self.bucket,
            location,
            storage_class,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def upload_ndjson(self, rows: Iterable[dict], blob_path: str) -> str:
        """
        Upload an iterable of dicts as newline-delimited JSON to GCS.

        Streams data through an in-memory buffer — memory-efficient for large exports.

        Args:
            rows:      Iterable of event dicts (any JSON-serialisable values).
            blob_path: Destination path inside the bucket,
                       e.g. "raw/appmetrica/12345/2024-01-01/events.ndjson"

        Returns:
            gs:// URI of the uploaded blob.

        Raises:
            RuntimeError: if called in stub mode (no credentials configured).
        """
        uri = f"gs://{self.bucket}/{blob_path}"

        if self._client is None:
            logger.info("stub upload_ndjson: %s (no credentials)", uri)
            return uri

        row_count = 0
        with tempfile.TemporaryFile(mode="w+b") as buffer:
            for row in rows:
                buffer.write((json.dumps(row, ensure_ascii=False, default=str) + "\n").encode("utf-8"))
                row_count += 1

            size_bytes = buffer.tell()
            buffer.seek(0)
            blob = self._bucket_obj.blob(blob_path)
            blob.upload_from_file(buffer, content_type="application/x-ndjson")

        size_kb = size_bytes / 1024
        logger.info(
            "uploaded: %s  rows=%d  size=%.1f KB",
            uri, row_count, size_kb,
        )
        return uri

    def blob_exists(self, blob_path: str) -> bool:
        """Return True if the blob already exists (used for idempotency check)."""
        if self._client is None:
            return False
        blob = self._bucket_obj.blob(blob_path)
        return blob.exists()

    def delete_blob(self, blob_path: str) -> None:
        """Delete a blob (used when retrying a failed partial upload)."""
        if self._client is None:
            return
        blob = self._bucket_obj.blob(blob_path)
        if blob.exists():
            blob.delete()
            logger.info("deleted partial blob: gs://%s/%s", self.bucket, blob_path)
