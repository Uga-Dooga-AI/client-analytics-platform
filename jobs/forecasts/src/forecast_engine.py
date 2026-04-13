"""
Forecast engine stub — lightweight statsmodels / Prophet wrapper.

Generates per-metric forecasts from experiment time-series data.

Real implementation will support:
  - statsmodels ExponentialSmoothing for short series (< 90 days)
  - Prophet for longer series with seasonality
  - Configurable horizon and confidence intervals
"""

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd

logger = logging.getLogger(__name__)

# Minimum data points required to run a forecast
MIN_ROWS = 14


class ForecastEngine:
    def __init__(self, horizon_days: int = 30) -> None:
        self.horizon_days = horizon_days

    def forecast(self, df: "pd.DataFrame") -> "pd.DataFrame":
        """
        Generate a forecast from a time-series DataFrame.

        Stub: returns an empty DataFrame. Real implementation will select
        statsmodels or Prophet based on series length and return a DataFrame
        with columns: date, metric, yhat, yhat_lower, yhat_upper.

        Args:
            df: output of MartReader.read_experiment_daily()

        Returns:
            pd.DataFrame with forecast points
        """
        import pandas as pd

        if df.empty:
            logger.info("stub forecast: input is empty, returning empty forecast")
            return pd.DataFrame()

        if len(df) < MIN_ROWS:
            logger.warning(
                "stub forecast: only %d rows, need at least %d — returning empty", len(df), MIN_ROWS
            )
            return pd.DataFrame()

        logger.info(
            "stub forecast: %d rows → horizon %d days (not yet implemented)",
            len(df),
            self.horizon_days,
        )
        # TODO: implement after mart data is available (UGAA-1167)
        return pd.DataFrame()
