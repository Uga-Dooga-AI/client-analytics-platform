"""
BigQuery results writer stub.

Writes forecast output to mart_forecast_points.

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

FORECAST_TABLE = "mart_forecast_points"


class ResultsWriter:
    def __init__(
        self,
        project_id: str | None = None,
        mart_dataset: str | None = None,
    ) -> None:
        self.project_id = project_id or os.environ.get("GCP_PROJECT_ID")
        self.mart_dataset = mart_dataset or os.environ.get("BQ_MART_DATASET", "mart")
        if not self.project_id:
            logger.warning("GCP_PROJECT_ID not set — running in stub mode")

    def write_forecast(self, df: "pd.DataFrame", run_date: str) -> None:
        """
        Append forecast results to mart_forecast_points.

        Stub: logs and returns without writing. Real implementation will use
        bigquery.Client().load_table_from_dataframe() with WRITE_APPEND
        and add a run_date partition column.

        Args:
            df:        output of ForecastEngine.forecast()
            run_date:  ISO date string identifying this run, e.g. "2024-01-02"
        """
        destination = f"{self.project_id}.{self.mart_dataset}.{FORECAST_TABLE}"
        if df.empty:
            logger.info("stub write_forecast: empty DataFrame, nothing to write to %s", destination)
            return

        logger.info(
            "stub write_forecast: %d rows → %s (run_date=%s)", len(df), destination, run_date
        )
        # TODO: implement after BQ mart schema is finalised (UGAA-1167)
