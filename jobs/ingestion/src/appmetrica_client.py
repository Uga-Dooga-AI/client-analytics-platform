"""
AppMetrica Logs API client stub.

Real implementation requires:
  - APPMETRICA_TOKEN env var (OAuth token)
  - app_ids from job config

Docs: https://appmetrica.yandex.ru/docs/logs-api/
"""

import logging
import os
from typing import Iterator

logger = logging.getLogger(__name__)


class AppMetricaClient:
    BASE_URL = "https://api.appmetrica.yandex.ru/logs/v1/export"

    def __init__(self, token: str | None = None) -> None:
        self.token = token or os.environ.get("APPMETRICA_TOKEN")
        if not self.token:
            logger.warning("APPMETRICA_TOKEN not set — running in stub mode")

    def fetch_events(
        self,
        app_id: int,
        date_from: str,
        date_to: str,
        event_names: list[str] | None = None,
    ) -> Iterator[dict]:
        """
        Fetch AppMetrica event log for a given app and date range.

        Stub: yields nothing. Real implementation will paginate the Logs API
        and yield raw event dicts.

        Args:
            app_id: AppMetrica application ID
            date_from: ISO date string, e.g. "2024-01-01"
            date_to:   ISO date string, e.g. "2024-01-01"
            event_names: optional filter list, e.g. ["ab_test_group", "purchase"]
        """
        logger.info(
            "stub fetch_events: app_id=%s date_from=%s date_to=%s", app_id, date_from, date_to
        )
        # TODO: implement after APPMETRICA_TOKEN is available (UGAA-1166)
        return iter([])
