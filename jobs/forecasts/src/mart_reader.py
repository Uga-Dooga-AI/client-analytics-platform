"""
BigQuery mart reader for forecast jobs.

Supports two modes:
  - live BigQuery reads from mart_experiment_daily
  - local CSV fallback via FORECAST_INPUT_PATH for dry-runs without credentials
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd

logger = logging.getLogger(__name__)

ALLOWED_METRICS = {
    "revenue": "SUM(COALESCE(revenue, 0))",
    "exposures": "SUM(COALESCE(exposures, 0))",
    "activations": "SUM(COALESCE(activations, 0))",
    "guardrail_crashes": "SUM(COALESCE(guardrail_crashes, 0))",
    "guardrail_errors": "SUM(COALESCE(guardrail_errors, 0))",
}


class MartReader:
    def __init__(
        self,
        project_id: str | None = None,
        mart_dataset: str | None = None,
        experiment_daily_table: str | None = None,
        input_path: str | None = None,
    ) -> None:
        self.project_id = project_id or os.environ.get("GCP_PROJECT_ID")
        self.mart_dataset = mart_dataset or os.environ.get("BQ_MART_DATASET", "mart")
        self.experiment_daily_table = (
            experiment_daily_table
            or os.environ.get("BQ_EXPERIMENT_DAILY_TABLE")
            or "mart_experiment_daily"
        )
        self.input_path = input_path or os.environ.get("FORECAST_INPUT_PATH")

        if not self.project_id:
            logger.warning("GCP_PROJECT_ID not set — BigQuery reader will stay in fallback mode")
            self._client = None
            self._bq = None
            return

        try:
            from google.cloud import bigquery  # type: ignore[import-untyped]

            self._bq = bigquery
            self._client = bigquery.Client(project=self.project_id)
        except ImportError:
            logger.warning("google-cloud-bigquery not installed — BigQuery reader unavailable")
            self._client = None
            self._bq = None

    def read_experiment_daily(
        self,
        date_from: str,
        date_to: str,
        metrics: list[str] | None = None,
    ) -> "pd.DataFrame":
        import pandas as pd

        metric_names = [metric for metric in (metrics or ["revenue", "exposures", "activations"]) if metric in ALLOWED_METRICS]
        if not metric_names:
            metric_names = ["revenue", "exposures", "activations"]

        if self._client is None:
            return self._read_from_local_input(metric_names)

        union_query = "\nUNION ALL\n".join(
            f"""
            SELECT
              date,
              '{metric}' AS metric,
              CAST({ALLOWED_METRICS[metric]} AS FLOAT64) AS value
            FROM `{self.project_id}.{self.mart_dataset}.{self.experiment_daily_table}`
            WHERE date BETWEEN @date_from AND @date_to
            GROUP BY date
            """
            for metric in metric_names
        )

        job_config = self._bq.QueryJobConfig(
            query_parameters=[
                self._bq.ScalarQueryParameter("date_from", "DATE", date_from),
                self._bq.ScalarQueryParameter("date_to", "DATE", date_to),
            ]
        )

        logger.info(
            "reading mart data: project=%s dataset=%s table=%s metrics=%s range=%s..%s",
            self.project_id,
            self.mart_dataset,
            self.experiment_daily_table,
            metric_names,
            date_from,
            date_to,
        )
        df = self._client.query(union_query, job_config=job_config).to_dataframe()
        if df.empty:
            return pd.DataFrame(columns=["date", "metric", "value"])

        df["date"] = pd.to_datetime(df["date"])
        return df.sort_values(["metric", "date"]).reset_index(drop=True)

    def _read_from_local_input(self, metrics: list[str]) -> "pd.DataFrame":
        import pandas as pd

        if not self.input_path:
            logger.info("no BigQuery client and FORECAST_INPUT_PATH is not set; returning empty frame")
            return pd.DataFrame(columns=["date", "metric", "value"])

        input_path = Path(self.input_path)
        if not input_path.exists():
            logger.warning("FORECAST_INPUT_PATH does not exist: %s", input_path)
            return pd.DataFrame(columns=["date", "metric", "value"])

        df = pd.read_csv(input_path)
        if "date" not in df.columns:
            raise ValueError("FORECAST_INPUT_PATH must contain a 'date' column")

        df["date"] = pd.to_datetime(df["date"])

        if {"metric", "value"}.issubset(df.columns):
            filtered = df[df["metric"].isin(metrics)][["date", "metric", "value"]].copy()
            return filtered.sort_values(["metric", "date"]).reset_index(drop=True)

        value_columns = [metric for metric in metrics if metric in df.columns]
        if not value_columns:
            logger.warning(
                "FORECAST_INPUT_PATH does not contain any requested metric columns; expected one of %s",
                metrics,
            )
            return pd.DataFrame(columns=["date", "metric", "value"])

        melted = df.melt(
            id_vars=["date"],
            value_vars=value_columns,
            var_name="metric",
            value_name="value",
        )
        melted["value"] = pd.to_numeric(melted["value"], errors="coerce")
        melted = melted.dropna(subset=["value"])
        return melted.sort_values(["metric", "date"]).reset_index(drop=True)
