"""
BigQuery mart reader for forecast jobs.

Supports two modes:
  - live BigQuery reads from mart_experiment_daily
  - local CSV fallback via FORECAST_INPUT_PATH for dry-runs without credentials
"""

from __future__ import annotations

from datetime import date, timedelta
import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd

logger = logging.getLogger(__name__)

ALLOWED_METRICS = {
    "revenue": "SUM(COALESCE(revenue, 0))",
    "dau": "SUM(COALESCE(dau, 0))",
    "installs": "SUM(COALESCE(installed, 0))",
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
        self.revenue_metrics_table = (
            os.environ.get("BQ_REVENUE_METRICS_TABLE")
            or self._derive_companion_table("revenue_metrics")
            or "mart_revenue_metrics"
        )
        self.daily_active_users_table = (
            os.environ.get("BQ_DAILY_ACTIVE_USERS_TABLE")
            or self._derive_companion_table("daily_active_users")
            or "mart_daily_active_users"
        )
        self.installs_funnel_table = (
            os.environ.get("BQ_INSTALLS_FUNNEL_TABLE")
            or self._derive_companion_table("installs_funnel")
            or "mart_installs_funnel"
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

    def _derive_companion_table(self, suffix: str) -> str | None:
        suffix_marker = "_experiment_daily"
        if self.experiment_daily_table.endswith(suffix_marker):
            prefix = self.experiment_daily_table[: -len(suffix_marker)]
            if prefix:
                return f"{prefix}_{suffix}"
        return None

    def resolve_available_window(self, date_from: str, date_to: str) -> tuple[str, str]:
        if self._client is None:
            return date_from, date_to

        try:
            requested_from = date.fromisoformat(date_from)
            requested_to = date.fromisoformat(date_to)
        except ValueError:
            return date_from, date_to

        if requested_from > requested_to:
            requested_from, requested_to = requested_to, requested_from

        latest_available = self._latest_available_date()
        if latest_available is None:
            return requested_from.isoformat(), requested_to.isoformat()

        if requested_from <= latest_available <= requested_to:
            return requested_from.isoformat(), requested_to.isoformat()

        span_days = max((requested_to - requested_from).days, 0)
        anchored_to = latest_available
        anchored_from = latest_available - timedelta(days=span_days)

        logger.info(
            "requested mart history window %s..%s is outside latest available date %s; re-anchoring to %s..%s",
            requested_from.isoformat(),
            requested_to.isoformat(),
            latest_available.isoformat(),
            anchored_from.isoformat(),
            anchored_to.isoformat(),
        )
        return anchored_from.isoformat(), anchored_to.isoformat()

    def read_experiment_daily(
        self,
        date_from: str,
        date_to: str,
        metrics: list[str] | None = None,
    ) -> "pd.DataFrame":
        import pandas as pd

        metric_names = [
            metric
            for metric in (metrics or ["revenue", "dau", "installs", "exposures", "activations"])
            if metric in ALLOWED_METRICS
        ]
        if not metric_names:
            metric_names = ["revenue", "dau", "installs", "exposures", "activations"]

        if self._client is None:
            return self._read_from_local_input(metric_names)

        frames: list[pd.DataFrame] = []
        for metric in metric_names:
            metric_frame = self._read_metric_frame(metric, date_from, date_to)
            if not metric_frame.empty:
                frames.append(metric_frame)

        if not frames:
            return pd.DataFrame(columns=["date", "metric", "value"])

        df = pd.concat(frames, ignore_index=True)
        df["date"] = pd.to_datetime(df["date"])
        return df.sort_values(["metric", "date"]).reset_index(drop=True)

    def _read_metric_frame(self, metric: str, date_from: str, date_to: str) -> "pd.DataFrame":
        import pandas as pd

        if self._client is None:
            return pd.DataFrame(columns=["date", "metric", "value"])

        if metric == "revenue":
            table_name = self.revenue_metrics_table
            date_column = "date"
            value_sql = "SUM(COALESCE(gross_revenue, 0))"
        elif metric == "dau":
            table_name = self.daily_active_users_table
            date_column = "date"
            value_sql = "SUM(COALESCE(dau, 0))"
        elif metric == "installs":
            table_name = self.installs_funnel_table
            date_column = "install_date"
            value_sql = "SUM(COALESCE(installed, 0))"
        else:
            table_name = self.experiment_daily_table
            date_column = "date"
            value_sql = ALLOWED_METRICS[metric]

        query = f"""
            SELECT
              {date_column} AS date,
              @metric AS metric,
              CAST({value_sql} AS FLOAT64) AS value
            FROM `{self.project_id}.{self.mart_dataset}.{table_name}`
            WHERE {date_column} BETWEEN @date_from AND @date_to
            GROUP BY {date_column}
        """
        job_config = self._bq.QueryJobConfig(
            query_parameters=[
                self._bq.ScalarQueryParameter("metric", "STRING", metric),
                self._bq.ScalarQueryParameter("date_from", "DATE", date_from),
                self._bq.ScalarQueryParameter("date_to", "DATE", date_to),
            ]
        )

        logger.info(
            "reading mart data: project=%s dataset=%s table=%s metric=%s range=%s..%s",
            self.project_id,
            self.mart_dataset,
            table_name,
            metric,
            date_from,
            date_to,
        )
        try:
            return self._client.query(query, job_config=job_config).to_dataframe()
        except Exception as error:
            message = str(error)
            if "Not found: Table" in message:
                logger.warning("skipping metric %s because source table is unavailable: %s", metric, message)
                return pd.DataFrame(columns=["date", "metric", "value"])
            raise

    def _latest_available_date(self) -> date | None:
        if self._client is None:
            return None

        candidates = [
            (self.experiment_daily_table, "date"),
            (self.revenue_metrics_table, "date"),
            (self.daily_active_users_table, "date"),
            (self.installs_funnel_table, "install_date"),
        ]
        latest_dates: list[date] = []
        seen: set[tuple[str, str]] = set()

        for table_name, date_column in candidates:
            key = (table_name, date_column)
            if key in seen:
                continue
            seen.add(key)

            latest_date = self._latest_available_date_for_table(table_name, date_column)
            if latest_date is not None:
                latest_dates.append(latest_date)

        if not latest_dates:
            return None

        return max(latest_dates)

    def _latest_available_date_for_table(self, table_name: str, date_column: str) -> date | None:
        if self._client is None:
            return None

        query = f"""
            SELECT MAX({date_column}) AS latest_date
            FROM `{self.project_id}.{self.mart_dataset}.{table_name}`
        """
        try:
            df = self._client.query(query).to_dataframe()
        except Exception as error:
            message = str(error)
            if "Not found: Table" in message:
                logger.warning(
                    "latest date probe skipped because source table is unavailable: %s",
                    message,
                )
                return None
            raise

        if df.empty or df["latest_date"].isna().all():
            return None

        latest_value = df["latest_date"].iloc[0]
        if latest_value is None:
            return None

        parsed = latest_value.date() if hasattr(latest_value, "date") else None
        if parsed is not None:
            return parsed

        try:
            return date.fromisoformat(str(latest_value))
        except ValueError:
            return None

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
