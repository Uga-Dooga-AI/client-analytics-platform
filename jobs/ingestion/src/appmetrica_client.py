"""
AppMetrica Logs API client.

Auth: APPMETRICA_TOKEN env var (OAuth token).
Docs: https://appmetrica.yandex.ru/docs/logs-api/

Behavior:
  - Requests the previous day's events for each app_id.
  - Polls for 202 Accepted (export being prepared) with exponential back-off.
  - Streams CSV response rows as dicts.
  - Returns an empty iterator when APPMETRICA_TOKEN is not set (stub mode).
"""

from __future__ import annotations

import csv
import io
import logging
import os
import time
from typing import Iterator

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

_BASE_URL = "https://api.appmetrica.yandex.ru/logs/v1/export"

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
        if event_names:
            params["event_name"] = ",".join(event_names)

        logger.info("fetch_events: app_id=%s %s → %s", app_id, date_from, date_to)

        data = self._export_with_poll(resource="events", params=params)
        yield from self._parse_csv(data)

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
        data = self._export_with_poll(resource="installations", params=params)
        yield from self._parse_csv(data)

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
            "duration_seconds",
            "os_name",
        ]
        params = {
            "application_id": app_id,
            "date_since": f"{date_from} 00:00:00",
            "date_until": f"{date_to} 23:59:59",
            "date_dimension": "default",
            "fields": ",".join(session_fields),
        }

        logger.info("fetch_sessions: app_id=%s %s → %s", app_id, date_from, date_to)
        data = self._export_with_poll(resource="sessions", params=params)
        yield from self._parse_csv(data)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _export_with_poll(self, resource: str, params: dict) -> str:
        """
        Call the Logs API export endpoint, polling until data is ready.

        Returns the response body as a UTF-8 string (CSV).

        Raises:
            RuntimeError: if the export fails or max attempts exceeded.
        """
        url = f"{_BASE_URL}/{resource}"
        headers = {"Authorization": f"OAuth {self.token}"}

        wait = _INITIAL_WAIT_S
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            resp = requests.get(url, params=params, headers=headers, timeout=60)

            if resp.status_code == 200:
                logger.info("export ready: resource=%s rows≈%d bytes", resource, len(resp.content))
                return resp.text

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

            resp.raise_for_status()

        raise RuntimeError(
            f"AppMetrica export did not complete after {_MAX_ATTEMPTS} attempts: {resource}"
        )

    @staticmethod
    def _parse_csv(data: str) -> Iterator[dict]:
        """Parse tab-separated CSV response into row dicts."""
        reader = csv.DictReader(io.StringIO(data), delimiter="\t")
        for row in reader:
            # Replace empty strings with None for cleaner BQ loads
            yield {k: (v if v != "" else None) for k, v in row.items()}
