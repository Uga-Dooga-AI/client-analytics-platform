"""
BigQuery mart reader stub.

Reads from mart_experiment_daily (and related marts) to supply
time-series data for the forecast engine.

Real implementation requires:
  - GCP_PROJECT_ID env var
  - BQ_MART_DATASET env var
  - Google Application Default Credentials
"""

import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd

logger = logging.getLogger(__name__)


class MartReader:
    def __init__(
        self,
        project_id: str | None = None,
        mart_dataset: str | None = None,
    ) -> None:
        self.project_id = project_id or os.environ.get("GCP_PROJECT_ID")
        self.mart_dataset = mart_dataset or os.environ.get("BQ_MART_DATASET", "mart")
        if not self.project_id:
            logger.warning("GCP_PROJECT_ID not set — running in stub mode")

    def read_experiment_daily(
        self,
        date_from: str,
        date_to: str,
        metrics: list[str] | None = None,
    ) -> "pd.DataFrame":
        """
        Read mart_experiment_daily for the given date range.

        Stub: returns empty DataFrame. Real implementation will run a
        parameterised BQ query and return a pandas DataFrame.

        Args:
            date_from: ISO date string, e.g. "2024-01-01"
            date_to:   ISO date string, e.g. "2024-03-31"
            metrics:   optional list of metric columns to select

        Returns:
            pd.DataFrame with columns: date, experiment_id, variant, metric, value
        """
        import pandas as pd

        logger.info(
            "stub read_experiment_daily: project=%s dataset=%s date_from=%s date_to=%s",
            self.project_id,
            self.mart_dataset,
            date_from,
            date_to,
        )
        # TODO: implement after GCP access confirmed (UGAA-1167)
        return pd.DataFrame()
