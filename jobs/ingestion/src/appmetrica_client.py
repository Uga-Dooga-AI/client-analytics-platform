"""
AppMetrica Logs API client.

Auth: APPMETRICA_TOKEN env var (OAuth token).
Docs: https://appmetrica.yandex.com/docs/en/mobile-api/logs/ref/

Behavior:
  - Requests AppMetrica Logs API exports in JSON mode.
  - Polls for 202 Accepted (export being prepared) with exponential back-off.
  - Normalizes empty strings to None for cleaner NDJSON → BigQuery loads.
  - Returns an empty iterator when APPMETRICA_TOKEN is not set (stub mode).
"""

from __future__ import annotations

import logging
import os
import time
from typing import Iterator

import ijson
import requests

logger = logging.getLogger(__name__)

# Fields requested from AppMetrica Logs API (must match sources.yml columns)
_EVENT_FIELDS = [
    "event_name",
    "event_datetime",
    "appmetrica_device_id",
    "profile_id",
    "event_json",
    "session_id",
    "os_name",
    "app_version_name",
    "country_iso_code",
    "city",
    "application_id",
]

_BASE_URL = "https://api.appmetrica.yandex.com/logs/v1/export"

# Polling config
_INITIAL_WAIT_S = 10
_MAX_WAIT_S = 120
_MAX_ATTEMPTS = 30


class AppMetricaClient:
    def __init__(self, token: str | None = None) -> None:
        self.token = token or os.environ.get("APPMETRICA_TOKEN")
        if not self.token:
            logger.warning("APPMETRICA_TOKEN not set — running in stub mode")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def fetch_events(
        self,
        app_id: int,
        date_from: str,
        date_to: str,
        event_names: list[str] | None = None,
    ) -> Iterator[dict]:
        """
        Fetch AppMetrica event log for a given app and date range.

        Args:
            app_id:      AppMetrica application ID.
            date_from:   ISO date string "YYYY-MM-DD" (inclusive).
            date_to:     ISO date string "YYYY-MM-DD" (inclusive).
            event_names: Optional filter. If given, only these events are fetched.

        Yields:
            Raw event dicts with keys matching _EVENT_FIELDS.
        """
        if not self.token:
            logger.info("stub fetch_events: app_id=%s (no token)", app_id)
            return

        params: dict[str, object] = {
            "application_id": app_id,
            "date_since": f"{date_from} 00:00:00",
            "date_until": f"{date_to} 23:59:59",
            "date_dimension": "default",
            "fields": ",".join(_EVENT_FIELDS),
        }
        logger.info("fetch_events: app_id=%s %s → %s", app_id, date_from, date_to)
        # AppMetrica field filters use equality semantics; passing multiple values as a
        # comma-separated string does not create an OR filter. When multiple event names
        # are configured, fetch the slice and filter locally.
        if event_names and len(event_names) == 1:
            params["event_name"] = event_names[0]

        rows = self._export_with_poll(endpoint="events.json", params=params)
        allowed_names = {name for name in (event_names or []) if name}
        for row in rows:
            normalized = self._normalize_row(row)
            if allowed_names and normalized.get("event_name") not in allowed_names:
                continue
            yield normalized

    def fetch_installs(
        self,
        app_id: int,
        date_from: str,
        date_to: str,
    ) -> Iterator[dict]:
        """Fetch install records for acquisition funnel ingestion."""
        if not self.token:
            logger.info("stub fetch_installs: app_id=%s (no token)", app_id)
            return

        install_fields = [
            "install_datetime",
            "appmetrica_device_id",
            "profile_id",
            "tracker_name",
            "country_iso_code",
            "os_name",
            "app_version_name",
        ]
        params = {
            "application_id": app_id,
            "date_since": f"{date_from} 00:00:00",
            "date_until": f"{date_to} 23:59:59",
            "date_dimension": "default",
            "fields": ",".join(install_fields),
        }

        logger.info("fetch_installs: app_id=%s %s → %s", app_id, date_from, date_to)
        rows = self._export_with_poll(endpoint="installations.json", params=params)
        for row in rows:
            yield self._normalize_row(row)

    def fetch_sessions(
        self,
        app_id: int,
        date_from: str,
        date_to: str,
    ) -> Iterator[dict]:
        """Fetch session records for retention / engagement metrics."""
        if not self.token:
            logger.info("stub fetch_sessions: app_id=%s (no token)", app_id)
            return

        session_fields = [
            "session_start_datetime",
            "appmetrica_device_id",
            "profile_id",
            "session_id",
            "os_name",
            "application_id",
        ]
        params = {
            "application_id": app_id,
            "date_since": f"{date_from} 00:00:00",
            "date_until": f"{date_to} 23:59:59",
            "date_dimension": "default",
            "fields": ",".join(session_fields),
        }

        logger.info("fetch_sessions: app_id=%s %s → %s", app_id, date_from, date_to)
        rows = self._export_with_poll(endpoint="sessions_starts.json", params=params)
        for row in rows:
            normalized = self._normalize_row(row)
            # AppMetrica Logs API exposes session starts, not completed session duration.
            # Keep the column present for downstream schema compatibility.
            normalized.setdefault("duration_seconds", None)
            yield normalized

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _export_with_poll(self, endpoint: str, params: dict) -> Iterator[dict]:
        """
        Call the Logs API export endpoint, polling until data is ready.

        Streams parsed rows from the JSON response payload.

        Raises:
            RuntimeError: if the export fails or max attempts exceeded.
        """
        url = f"{_BASE_URL}/{endpoint}"
        headers = {"Authorization": f"OAuth {self.token}"}

        wait = _INITIAL_WAIT_S
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            with requests.get(url, params=params, headers=headers, timeout=60, stream=True) as resp:
                if resp.status_code == 200:
                    yield from self._iter_export_rows(resp, endpoint)
                    return

                if resp.status_code == 202:
                    logger.info(
                        "export not ready (202), attempt %d/%d — waiting %ds",
                        attempt, _MAX_ATTEMPTS, wait,
                    )
                    time.sleep(wait)
                    wait = min(wait * 2, _MAX_WAIT_S)
                    continue

                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", wait))
                    logger.warning("rate limited (429), waiting %ds", retry_after)
                    time.sleep(retry_after)
                    continue

                body_preview = resp.text[:400]
                logger.error(
                    "AppMetrica export request failed: endpoint=%s status=%s body=%s",
                    endpoint,
                    resp.status_code,
                    body_preview,
                )
                resp.raise_for_status()

        raise RuntimeError(
            f"AppMetrica export did not complete after {_MAX_ATTEMPTS} attempts: {endpoint}"
        )

    @staticmethod
    def _iter_export_rows(response: requests.Response, endpoint: str) -> Iterator[dict]:
        response.raw.decode_content = True
        row_count = 0

        for row in ijson.items(response.raw, "data.item"):
            row_count += 1
            yield row

        logger.info("export ready: endpoint=%s rows=%d", endpoint, row_count)

    @staticmethod
    def _normalize_row(row: dict) -> dict:
        """Replace empty strings with None for cleaner BQ loads."""
        return {k: (v if v != "" else None) for k, v in row.items()}
