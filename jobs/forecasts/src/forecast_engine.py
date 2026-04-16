"""
Forecast engine for mart time-series.

Implements a pragmatic hybrid:
  - Holt Exponential Smoothing for short / medium series
  - Prophet for longer series when the dependency is available

The output schema matches mart_forecast_points:
  run_id, metric, date, p50, p10, p90, generated_at
"""

from __future__ import annotations

import logging
import uuid
from statistics import NormalDist
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd

logger = logging.getLogger(__name__)

MIN_ROWS = 14


class ForecastEngine:
    def __init__(
        self,
        horizon_days: int = 30,
        confidence_interval: float = 0.8,
        min_history_days: int = MIN_ROWS,
        engine: str = "auto",
    ) -> None:
        self.horizon_days = horizon_days
        self.confidence_interval = max(0.5, min(confidence_interval, 0.99))
        self.min_history_days = max(min_history_days, MIN_ROWS)
        self.engine = engine

    def forecast(self, df: "pd.DataFrame", run_id: str | None = None) -> "pd.DataFrame":
        import pandas as pd

        if df.empty:
            logger.info("forecast skipped: input frame is empty")
            return pd.DataFrame(columns=["run_id", "metric", "date", "p50", "p10", "p90", "generated_at"])

        run_id = run_id or str(uuid.uuid4())
        generated_at = pd.Timestamp.utcnow()
        results: list[pd.DataFrame] = []

        for metric, metric_df in df.groupby("metric"):
            forecast_df = self._forecast_metric(metric_df, metric, run_id, generated_at)
            if not forecast_df.empty:
                results.append(forecast_df)

        if not results:
            return pd.DataFrame(columns=["run_id", "metric", "date", "p50", "p10", "p90", "generated_at"])

        return pd.concat(results, ignore_index=True)

    def _forecast_metric(
        self,
        metric_df: "pd.DataFrame",
        metric: str,
        run_id: str,
        generated_at,
    ) -> "pd.DataFrame":
        import pandas as pd

        metric_df = metric_df.sort_values("date").copy()
        metric_df["date"] = pd.to_datetime(metric_df["date"])
        metric_df["value"] = pd.to_numeric(metric_df["value"], errors="coerce")
        metric_df = metric_df.dropna(subset=["value"])
        if metric_df.empty or len(metric_df) < self.min_history_days:
            logger.info("forecast skipped for metric=%s: only %d usable rows", metric, len(metric_df))
            return pd.DataFrame()

        series = (
            metric_df.set_index("date")["value"]
            .sort_index()
            .asfreq("D")
            .interpolate(limit_direction="both")
            .fillna(method="ffill")
            .fillna(method="bfill")
        )
        if len(series) < self.min_history_days:
            logger.info("forecast skipped for metric=%s after resample: %d rows", metric, len(series))
            return pd.DataFrame()

        method = self._select_method(len(series))
        try:
            if method == "prophet":
                forecast = self._run_prophet(series)
            else:
                forecast = self._run_holt(series)
        except Exception as exc:  # noqa: BLE001
            if method != "holt":
                logger.warning("prophet forecast failed for %s, falling back to holt: %s", metric, exc)
                forecast = self._run_holt(series)
            else:
                raise

        forecast["p10"] = forecast["p10"].clip(lower=0)
        forecast["p50"] = forecast["p50"].clip(lower=0)
        forecast["p90"] = forecast["p90"].clip(lower=forecast["p50"])

        forecast["run_id"] = run_id
        forecast["metric"] = metric
        forecast["generated_at"] = generated_at
        return forecast[["run_id", "metric", "date", "p50", "p10", "p90", "generated_at"]]

    def _select_method(self, series_length: int) -> str:
        if self.engine != "auto":
            return self.engine
        return "prophet" if series_length >= 90 else "holt"

    def _run_holt(self, series):
        import pandas as pd
        from statsmodels.tsa.holtwinters import ExponentialSmoothing

        model = ExponentialSmoothing(
            series,
            trend="add",
            damped_trend=True,
            seasonal=None,
            initialization_method="estimated",
        )
        fitted = model.fit(optimized=True, use_brute=True)
        forecast = fitted.forecast(self.horizon_days)
        residuals = (series - fitted.fittedvalues).dropna()
        sigma = float(residuals.std(ddof=1)) if not residuals.empty else 0.0
        if sigma <= 0:
            sigma = max(float(series.std(ddof=1) or 0.0) * 0.15, 1.0)

        z_value = NormalDist().inv_cdf((1 + self.confidence_interval) / 2)
        lower = forecast - z_value * sigma
        upper = forecast + z_value * sigma

        return pd.DataFrame(
            {
                "date": forecast.index,
                "p50": forecast.values,
                "p10": lower.values,
                "p90": upper.values,
            }
        )

    def _run_prophet(self, series):
        import pandas as pd
        from prophet import Prophet

        prophet_df = series.reset_index()
        prophet_df.columns = ["ds", "y"]

        model = Prophet(
            interval_width=self.confidence_interval,
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=len(prophet_df) >= 180,
        )
        model.fit(prophet_df)

        future = model.make_future_dataframe(periods=self.horizon_days, include_history=False, freq="D")
        forecast = model.predict(future)
        return pd.DataFrame(
            {
                "date": pd.to_datetime(forecast["ds"]),
                "p50": forecast["yhat"].values,
                "p10": forecast["yhat_lower"].values,
                "p90": forecast["yhat_upper"].values,
            }
        )
