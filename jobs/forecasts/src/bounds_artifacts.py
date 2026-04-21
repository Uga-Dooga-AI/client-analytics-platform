from __future__ import annotations

import logging
import math
import pickle
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import median
from typing import Any, Iterable

import numpy as np

logger = logging.getLogger(__name__)

NOTEBOOK_HISTORY_MIN_DAY = 4
BOUNDS_MAX_CUTOFF = 91
BOUNDS_MIN_PREDICTIONS = 10
BOUNDS_SIZE_SMOOTH_COEFF = 1.2
BOUNDS_SMALL_COHORT_NEAREST_FILL_MAX_SIZE = 100
NOTEBOOK_BOUNDS_MIN_COHORT_SIZE = 1
NOTEBOOK_BOUNDS_MAX_COHORT_SIZE = 1000

NOTEBOOK_BOUNDS_HISTORY_DAYS = [
    *range(4, 30),
    35,
    42,
    49,
    56,
    63,
    70,
    77,
    84,
    91,
]

NOTEBOOK_BOUNDS_PREDICTION_PERIODS = [
    *range(7, 31),
    40,
    50,
    60,
    70,
    80,
    90,
    100,
    120,
    140,
    160,
    180,
    200,
    220,
    240,
    260,
    280,
    300,
    320,
    340,
    360,
]

SUPPORTED_BOUNDS_GRANULARITY_DAYS = [1, 2, 3, 5, 7, 14, 30]


@dataclass(frozen=True)
class RawCohortRecord:
    cohort_date: str
    cohort_size: int
    cohort_num_days: int
    daily_revenue: dict[int, float]


@dataclass(frozen=True)
class ProcessedCohort:
    cohort_date: str
    cohort_size: int
    cohort_num_days: int
    cohort_lifetime: int
    is_corrupted: int
    total_revenue: list[float]


@dataclass(frozen=True)
class BoundsTrainingRecord:
    cohort_date: str
    cohort_size: int
    true_for: dict[int, float]
    predicted_for_by_cutoff: dict[str, float]
    bad_by_cutoff: set[int]


def func_o(params, x, y=None):
    a = params["a"].value
    b = params["b"].value
    c = params["c"].value
    fitted = a * x ** (b * x**c)
    if y is None:
        return fitted
    weight = 0.58 + 1.42 * ((max(x.max(), 15) - x[::-1] + 1) / max(x.max(), 15)) ** 2
    weight[0] = 0
    return np.multiply(np.abs(fitted - y), weight)


def estimate_curve(total_revenue: list[float], cutoff: int, horizon: int) -> list[float] | None:
    import lmfit

    if cutoff < NOTEBOOK_HISTORY_MIN_DAY or len(total_revenue) < cutoff:
        return None

    y_raw = np.asarray(total_revenue[:cutoff], dtype=float)
    if len(y_raw) < NOTEBOOK_HISTORY_MIN_DAY:
        return None

    params = lmfit.Parameters()
    params.add("a", value=1)
    params.add("b", value=0.2, min=0, max=3)
    params.add("c", value=-0.01, min=-3, max=0)
    y = y_raw / y_raw[0] if y_raw[0] > 0 else y_raw
    x = np.arange(cutoff) + 1
    x_predict = np.arange(horizon + 1) + 1
    minner = lmfit.Minimizer(func_o, params, fcn_args=(x, y))
    result = minner.minimize(method="lbfgsb")
    pred_y = func_o(result.params, x_predict) * y_raw[0]
    return [float(value) for value in pred_y.tolist()]


def bounds_key(period: int, cutoff: int) -> str:
    return f"for_{period}_on_{cutoff}"


def normalize_bounds_cohort_size(cohort_size: int | float) -> int:
    lower = math.floor(cohort_size)
    upper = math.ceil(cohort_size)
    nearest = lower if cohort_size - lower <= upper - cohort_size else upper
    return max(NOTEBOOK_BOUNDS_MIN_COHORT_SIZE, min(nearest, NOTEBOOK_BOUNDS_MAX_COHORT_SIZE))


def compress_size_ranges(values: Iterable[int]) -> list[dict[str, int]]:
    unique_values = sorted(set(int(value) for value in values))
    if not unique_values:
        return []

    ranges: list[dict[str, int]] = []
    start = unique_values[0]
    previous = unique_values[0]
    for value in unique_values[1:]:
        if value == previous + 1:
            previous = value
            continue
        ranges.append({"from": start, "to": previous})
        start = value
        previous = value
    ranges.append({"from": start, "to": previous})
    return ranges


def summarize_size_ranges(values: Iterable[int], *, limit: int = 8) -> str:
    ranges = compress_size_ranges(values)
    if not ranges:
        return "none"
    preview = ranges[:limit]
    suffix = ""
    if len(ranges) > limit:
        suffix = f", +{len(ranges) - limit} more"
    rendered = ", ".join(
        str(item["from"]) if item["from"] == item["to"] else f"{item['from']}-{item['to']}"
        for item in preview
    )
    return f"{rendered}{suffix}"


class BoundsArtifactBuilder:
    def __init__(
        self,
        *,
        project_id: str,
        raw_dataset: str,
        project_slug: str,
        run_date: str | None = None,
        bounds_history_days: int | None = None,
    ) -> None:
        from google.cloud import bigquery  # type: ignore[import-untyped]

        self.project_id = project_id
        self.raw_dataset = raw_dataset
        self.project_slug = project_slug
        self.run_date = run_date or date.today().isoformat()
        self.bounds_history_days = bounds_history_days
        self.events_cutoff = (date.today() - timedelta(days=1)).isoformat()
        self._bq = bigquery
        self._client = bigquery.Client(project=self.project_id)
        self.prefix = self.project_slug.replace("-", "_")
        self.installs_table = f"{self.prefix}_appmetrica_installs"
        self.events_table = f"{self.prefix}_appmetrica_events"

    def build(self) -> tuple[dict[int, bytes], dict[str, Any]]:
        available_window = self._resolve_available_window()
        logger.info(
            "building notebook bounds artifacts: project=%s raw=%s.%s installs=%s events=%s window=%s..%s cutoff=%s",
            self.project_slug,
            self.project_id,
            self.raw_dataset,
            self.installs_table,
            self.events_table,
            available_window["from"],
            available_window["to"],
            self.events_cutoff,
        )

        rows = self._load_project_wide_rows(available_window["from"], available_window["to"])
        raw_cohorts, corrupted_days = self._split_project_wide_rows(rows)
        processed_cohorts, granularity_diagnostics = build_multigranularity_processed_cohorts(
            raw_cohorts,
            corrupted_days,
            self.events_cutoff,
            SUPPORTED_BOUNDS_GRANULARITY_DAYS,
        )
        training_records, diagnostics = build_bounds_training_records(
            processed_cohorts,
            NOTEBOOK_BOUNDS_HISTORY_DAYS,
            NOTEBOOK_BOUNDS_PREDICTION_PERIODS,
            365,
        )

        artifacts: dict[int, bytes] = {}
        omitted_for_coverage: list[int] = []
        omitted_for_empty_table: list[int] = []
        training_sizes = sorted({record.cohort_size for record in training_records})

        logger.info(
            "publishing notebook bounds tables: processed_cohorts=%d training_records=%d corrupted_days=%d min_predictions=%d smooth_coeff=%.2f",
            len(processed_cohorts),
            len(training_records),
            len(corrupted_days),
            BOUNDS_MIN_PREDICTIONS,
            BOUNDS_SIZE_SMOOTH_COEFF,
        )

        for cohort_size in range(
            NOTEBOOK_BOUNDS_MIN_COHORT_SIZE,
            NOTEBOOK_BOUNDS_MAX_COHORT_SIZE + 1,
        ):
            smooth_count = smooth_record_count(training_records, cohort_size)
            if smooth_count < BOUNDS_MIN_PREDICTIONS:
                omitted_for_coverage.append(cohort_size)
                if cohort_size % 100 == 0:
                    logger.info(
                        "skipped notebook bounds artifact %d/1000 for %s due to insufficient smoothed training coverage (%d < %d)",
                        cohort_size,
                        self.project_slug,
                        smooth_count,
                        BOUNDS_MIN_PREDICTIONS,
                    )
                continue

            bounds_table = build_bounds_for_cohort_size(
                training_records,
                cohort_size,
                365,
                NOTEBOOK_BOUNDS_HISTORY_DAYS,
                NOTEBOOK_BOUNDS_PREDICTION_PERIODS,
            )
            if not bounds_table:
                omitted_for_empty_table.append(cohort_size)
                if cohort_size % 100 == 0:
                    logger.info(
                        "skipped notebook bounds artifact %d/1000 for %s because no empirical bounds keys were produced",
                        cohort_size,
                        self.project_slug,
                    )
                continue

            artifacts[cohort_size] = serialize_bounds_artifact(bounds_table)
            if cohort_size % 100 == 0:
                logger.info(
                    "built notebook bounds artifact %d/1000 for %s",
                    cohort_size,
                    self.project_slug,
                )

        if omitted_for_coverage:
            logger.warning(
                "omitted notebook bounds artifacts for %d cohort sizes due to insufficient smoothed coverage (<%d records); ranges=%s",
                len(omitted_for_coverage),
                BOUNDS_MIN_PREDICTIONS,
                summarize_size_ranges(omitted_for_coverage),
            )
        if omitted_for_empty_table:
            logger.warning(
                "omitted notebook bounds artifacts for %d cohort sizes because no empirical bounds keys were produced; ranges=%s",
                len(omitted_for_empty_table),
                summarize_size_ranges(omitted_for_empty_table),
            )

        metadata = {
            "runDate": self.run_date,
            "artifactFormat": "pickle-list-last-element-dict",
            "artifactExpectedSizeCount": NOTEBOOK_BOUNDS_MAX_COHORT_SIZE,
            "artifactGeneratedSizeCount": len(artifacts),
            "artifactOmittedSizeCount": len(omitted_for_coverage) + len(omitted_for_empty_table),
            "artifactOmittedForCoverageCount": len(omitted_for_coverage),
            "artifactOmittedForEmptyTableCount": len(omitted_for_empty_table),
            "artifactOmittedSizeRanges": compress_size_ranges(
                [*omitted_for_coverage, *omitted_for_empty_table]
            ),
            "artifactMinPredictionsRequired": BOUNDS_MIN_PREDICTIONS,
            "artifactSizeSmoothCoeff": BOUNDS_SIZE_SMOOTH_COEFF,
            "artifactWindow": available_window,
            "eventsCutoffDate": self.events_cutoff,
            "revenueMode": "total",
            "runDateFreq": 1,
            "historyDayRange": {
                "from": NOTEBOOK_HISTORY_MIN_DAY,
                "to": BOUNDS_MAX_CUTOFF,
            },
            "predictionPeriodRange": {
                "from": 7,
                "to": 365,
            },
            "granularityDaysIncluded": SUPPORTED_BOUNDS_GRANULARITY_DAYS,
            "granularityDiagnostics": granularity_diagnostics,
            "processedCohortCount": len(processed_cohorts),
            "corruptedDayCount": len(corrupted_days),
            "trainingRecordCount": len(training_records),
            "trainingCohortSizeMin": training_sizes[0] if training_sizes else None,
            "trainingCohortSizeMax": training_sizes[-1] if training_sizes else None,
            "trainingCohortSizePreview": training_sizes[:50],
            "curveDiagnostics": diagnostics,
        }
        return artifacts, metadata

    def _resolve_available_window(self) -> dict[str, str]:
        query = f"""
            SELECT
              CAST(MIN(DATE(SAFE_CAST(install_datetime AS TIMESTAMP))) AS STRING) AS min_install_date,
              CAST(MAX(DATE(SAFE_CAST(install_datetime AS TIMESTAMP))) AS STRING) AS max_install_date
            FROM `{self.project_id}.{self.raw_dataset}.{self.installs_table}`
            WHERE DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) <= DATE(@cutoff)
              AND COALESCE(NULLIF(CAST(profile_id AS STRING), ''), CAST(appmetrica_device_id AS STRING)) IS NOT NULL
        """
        result = self._client.query(
            query,
            job_config=self._bq.QueryJobConfig(
                query_parameters=[
                    self._bq.ScalarQueryParameter("cutoff", "DATE", self.events_cutoff),
                ]
            ),
        ).result()
        row = next(iter(result), None)
        min_install_date = str(getattr(row, "min_install_date", "") or "").strip()
        max_install_date = str(getattr(row, "max_install_date", "") or "").strip()
        if not min_install_date or not max_install_date:
            raise ValueError(
                f"Raw installs table {self.installs_table} has no usable install rows for notebook bounds."
            )
        if self.bounds_history_days and self.bounds_history_days > 0:
            bounded_from = (
                date.fromisoformat(self.events_cutoff) - timedelta(days=self.bounds_history_days - 1)
            ).isoformat()
            min_install_date = max(min_install_date, bounded_from)
        return {
            "from": min_install_date,
            "to": min(max_install_date, self.events_cutoff),
        }

    def _load_project_wide_rows(self, date_from: str, date_to: str) -> list[dict[str, Any]]:
        query = f"""
            WITH installs AS (
              SELECT
                DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) AS cohort_date,
                COALESCE(NULLIF(CAST(profile_id AS STRING), ''), CAST(appmetrica_device_id AS STRING)) AS user_key
              FROM `{self.project_id}.{self.raw_dataset}.{self.installs_table}`
              WHERE _PARTITIONDATE BETWEEN DATE(@from) AND DATE(@to)
                AND DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) BETWEEN DATE(@from) AND DATE(@to)
                AND COALESCE(NULLIF(CAST(profile_id AS STRING), ''), CAST(appmetrica_device_id AS STRING)) IS NOT NULL
            ),
            events AS (
              SELECT
                COALESCE(NULLIF(CAST(profile_id AS STRING), ''), CAST(appmetrica_device_id AS STRING)) AS user_key,
                DATE(SAFE_CAST(event_datetime AS TIMESTAMP)) AS event_date,
                SUM(
                  COALESCE(
                    SAFE_CAST(JSON_VALUE(event_json, '$.price') AS FLOAT64),
                    SAFE_CAST(JSON_VALUE(event_json, '$.revenue') AS FLOAT64),
                    SAFE_CAST(JSON_VALUE(event_json, '$.value') AS FLOAT64),
                    0
                  )
                ) AS revenue
              FROM `{self.project_id}.{self.raw_dataset}.{self.events_table}`
              WHERE _PARTITIONDATE BETWEEN DATE(@from) AND DATE(@events_to)
                AND DATE(SAFE_CAST(event_datetime AS TIMESTAMP)) BETWEEN DATE(@from) AND DATE(@events_to)
                AND event_name IN ('c_ad_revenue', 'purchase', 'in_app_purchase', 'subscription_start')
                AND COALESCE(NULLIF(CAST(profile_id AS STRING), ''), CAST(appmetrica_device_id AS STRING)) IS NOT NULL
              GROUP BY 1, 2
            ),
            corrupted_users AS (
              SELECT DISTINCT i.user_key
              FROM installs i
              INNER JOIN events e
                ON e.user_key = i.user_key
              WHERE e.event_date < i.cohort_date
            ),
            clean_installs AS (
              SELECT i.*
              FROM installs i
              LEFT JOIN corrupted_users bad
                ON bad.user_key = i.user_key
              WHERE bad.user_key IS NULL
            ),
            cohort_sizes AS (
              SELECT
                cohort_date,
                COUNT(DISTINCT user_key) AS cohort_size
              FROM clean_installs
              GROUP BY 1
            ),
            revenue_rows AS (
              SELECT
                i.cohort_date,
                e.event_date,
                DATE_DIFF(e.event_date, i.cohort_date, DAY) AS lifetime_day,
                SUM(e.revenue) AS revenue
              FROM clean_installs i
              INNER JOIN events e
                ON e.user_key = i.user_key
               AND e.event_date >= i.cohort_date
               AND e.event_date <= DATE_ADD(i.cohort_date, INTERVAL 365 DAY)
              GROUP BY 1, 2, 3
            ),
            event_day_counts AS (
              SELECT
                e.event_date,
                COUNT(*) AS event_count
              FROM clean_installs i
              INNER JOIN events e
                ON e.user_key = i.user_key
               AND e.event_date >= i.cohort_date
              GROUP BY 1
            )
            SELECT
              'cohort_size' AS row_type,
              CAST(cohort_date AS STRING) AS cohort_date,
              CAST(NULL AS STRING) AS event_date,
              CAST(NULL AS INT64) AS lifetime_day,
              cohort_size,
              CAST(NULL AS FLOAT64) AS revenue,
              CAST(NULL AS INT64) AS event_count
            FROM cohort_sizes
            UNION ALL
            SELECT
              'revenue' AS row_type,
              CAST(cohort_date AS STRING) AS cohort_date,
              CAST(event_date AS STRING) AS event_date,
              lifetime_day,
              CAST(NULL AS INT64) AS cohort_size,
              revenue,
              CAST(NULL AS INT64) AS event_count
            FROM revenue_rows
            UNION ALL
            SELECT
              'event_day_count' AS row_type,
              CAST(NULL AS STRING) AS cohort_date,
              CAST(event_date AS STRING) AS event_date,
              CAST(NULL AS INT64) AS lifetime_day,
              CAST(NULL AS INT64) AS cohort_size,
              CAST(NULL AS FLOAT64) AS revenue,
              event_count
            FROM event_day_counts
        """
        logger.info(
            "querying notebook bounds inputs: project=%s range=%s..%s cutoff=%s",
            self.project_slug,
            date_from,
            date_to,
            self.events_cutoff,
        )
        job = self._client.query(
            query,
            job_config=self._bq.QueryJobConfig(
                query_parameters=[
                    self._bq.ScalarQueryParameter("from", "DATE", date_from),
                    self._bq.ScalarQueryParameter("to", "DATE", date_to),
                    self._bq.ScalarQueryParameter("events_to", "DATE", self.events_cutoff),
                ]
            ),
        )
        return [dict(row.items()) for row in job.result()]

    def _split_project_wide_rows(
        self, rows: list[dict[str, Any]]
    ) -> tuple[list[RawCohortRecord], set[str]]:
        cohort_sizes: dict[str, int] = {}
        revenue_by_cohort: dict[str, dict[int, float]] = {}
        event_day_counts: dict[str, int] = {}
        for row in rows:
            row_type = str(row.get("row_type") or "")
            if row_type == "cohort_size":
                cohort_date = str(row.get("cohort_date") or "")
                if cohort_date:
                    cohort_sizes[cohort_date] = int(row.get("cohort_size") or 0)
                continue
            if row_type == "revenue":
                cohort_date = str(row.get("cohort_date") or "")
                lifetime_day = row.get("lifetime_day")
                if not cohort_date or lifetime_day is None:
                    continue
                revenue_by_day = revenue_by_cohort.setdefault(cohort_date, {})
                lifetime = int(lifetime_day)
                revenue_by_day[lifetime] = revenue_by_day.get(lifetime, 0.0) + float(
                    row.get("revenue") or 0.0
                )
                continue
            if row_type == "event_day_count":
                event_date = str(row.get("event_date") or "")
                if event_date:
                    event_day_counts[event_date] = int(row.get("event_count") or 0)

        corrupted_days = detect_corrupted_days(event_day_counts, min(cohort_sizes), self.events_cutoff)
        raw_cohorts = [
            RawCohortRecord(
                cohort_date=cohort_date,
                cohort_size=max(0, cohort_sizes.get(cohort_date, 0)),
                cohort_num_days=1,
                daily_revenue=revenue_by_cohort.get(cohort_date, {}),
            )
            for cohort_date in sorted(cohort_sizes.keys())
        ]
        if not raw_cohorts:
            raise ValueError(f"No cohort rows were built for {self.project_slug} notebook bounds rebuild.")
        return raw_cohorts, corrupted_days


def process_raw_cohorts(
    raw_cohorts: list[RawCohortRecord],
    corrupted_days: set[str],
    today_iso: str,
) -> list[ProcessedCohort]:
    ratios = calculate_revenue_ratios(raw_cohorts)
    processed: list[ProcessedCohort] = []
    for cohort in raw_cohorts:
        repaired = repair_cohort_revenue(cohort, corrupted_days, today_iso, ratios)
        running_total = 0.0
        total_revenue: list[float] = []
        for value in repaired["daily"]:
            running_total += value
            total_revenue.append(running_total)
        processed.append(
            ProcessedCohort(
                cohort_date=cohort.cohort_date,
                cohort_size=cohort.cohort_size,
                cohort_num_days=max(1, cohort.cohort_num_days),
                cohort_lifetime=max(0, len(repaired["daily"]) - 1),
                is_corrupted=int(repaired["is_corrupted"]),
                total_revenue=total_revenue,
            )
        )
    return processed


def build_multigranularity_processed_cohorts(
    raw_cohorts: list[RawCohortRecord],
    corrupted_days: set[str],
    today_iso: str,
    granularity_days: list[int],
) -> tuple[list[ProcessedCohort], dict[str, Any]]:
    if not raw_cohorts:
        return [], {
            "granularityDays": [],
            "anchorCountByGranularity": {},
            "processedCohortCountByGranularity": {},
        }

    min_cohort_date = min(cohort.cohort_date for cohort in raw_cohorts)
    processed: list[ProcessedCohort] = []
    anchor_count_by_granularity: dict[str, int] = {}
    processed_count_by_granularity: dict[str, int] = {}

    for step_days in granularity_days:
        offsets = [0] if step_days <= 1 else list(range(step_days))
        anchor_count_by_granularity[str(step_days)] = len(offsets)
        processed_count = 0

        for offset in offsets:
            anchor_date = add_days(min_cohort_date, offset)
            aggregated = aggregate_raw_cohorts(raw_cohorts, step_days, anchor_date)
            processed_for_offset = process_raw_cohorts(aggregated, corrupted_days, today_iso)
            processed.extend(processed_for_offset)
            processed_count += len(processed_for_offset)

        processed_count_by_granularity[str(step_days)] = processed_count

    diagnostics = {
        "granularityDays": granularity_days,
        "anchorCountByGranularity": anchor_count_by_granularity,
        "processedCohortCountByGranularity": processed_count_by_granularity,
    }
    return processed, diagnostics


def aggregate_raw_cohorts(
    raw_cohorts: list[RawCohortRecord],
    step_days: int,
    anchor_date: str,
) -> list[RawCohortRecord]:
    if step_days <= 1:
        return raw_cohorts

    buckets: dict[str, dict[str, Any]] = {}
    for cohort in raw_cohorts:
        bucket_date = align_to_bucket(cohort.cohort_date, anchor_date, step_days)
        bucket = buckets.setdefault(
            bucket_date,
            {"cohort_size": 0, "cohort_num_days": 0, "daily_revenue": {}},
        )
        bucket["cohort_size"] += cohort.cohort_size
        bucket["cohort_num_days"] += cohort.cohort_num_days
        revenue_by_day: dict[int, float] = bucket["daily_revenue"]
        for lifetime_day, value in cohort.daily_revenue.items():
            revenue_by_day[lifetime_day] = revenue_by_day.get(lifetime_day, 0.0) + value

    return [
        RawCohortRecord(
            cohort_date=cohort_date,
            cohort_size=max(0, int(values["cohort_size"])),
            cohort_num_days=max(1, int(values["cohort_num_days"])),
            daily_revenue=dict(values["daily_revenue"]),
        )
        for cohort_date, values in sorted(buckets.items())
    ]


def calculate_revenue_ratios(cohorts: Iterable[RawCohortRecord]) -> dict[str, float]:
    ratios12: list[float] = []
    ratios13: list[float] = []
    for cohort in cohorts:
        day1 = cohort.daily_revenue.get(0)
        day2 = cohort.daily_revenue.get(1)
        day3 = cohort.daily_revenue.get(2)
        if day1 is not None and day2 is not None and day1 != 0:
            ratios12.append(day2 / day1)
        if day1 is not None and day3 is not None and day1 != 0:
            ratios13.append(day3 / day1)
    return {
        "d1d2": safe_ratio_aggregate(ratios12),
        "d1d3": safe_ratio_aggregate(ratios13),
    }


def repair_cohort_revenue(
    cohort: RawCohortRecord,
    corrupted_days: set[str],
    today_iso: str,
    ratios: dict[str, float],
) -> dict[str, Any]:
    lifetime = max(0, day_diff(cohort.cohort_date, today_iso))
    revenue = []
    for day in range(lifetime + 1):
        current_date = add_days(cohort.cohort_date, day)
        if current_date in corrupted_days:
            revenue.append(float("nan"))
        else:
            revenue.append(float(cohort.daily_revenue.get(day, 0.0)))

    repaired_daily_corrupted = 0
    if all(math.isnan(value) for value in revenue):
        repaired_daily_corrupted = 1
        return {
            "daily": [0.0 for _ in revenue],
            "is_corrupted": repaired_daily_corrupted,
        }

    if len(revenue) > 3:
        if math.isnan(revenue[0]) and math.isnan(revenue[1]) and not math.isnan(revenue[2]):
            revenue[0] = revenue[2] / (ratios["d1d3"] or 1.0)
            revenue[1] = (revenue[2] / (ratios["d1d3"] or 1.0)) * (ratios["d1d2"] or 1.0)
        elif math.isnan(revenue[0]) and not math.isnan(revenue[1]):
            revenue[0] = revenue[1] / (ratios["d1d2"] or 1.0)
        elif math.isnan(revenue[1]) and not math.isnan(revenue[0]):
            revenue[1] = revenue[0] * (ratios["d1d2"] or 1.0)
        interpolate_in_place(revenue)
    elif any(math.isnan(value) for value in revenue):
        repaired_daily_corrupted = 1

    return {
        "daily": [0.0 if math.isnan(value) else float(value) for value in revenue],
        "is_corrupted": repaired_daily_corrupted,
    }


def build_bounds_training_records(
    cohorts: list[ProcessedCohort],
    history_days: list[int],
    prediction_periods: list[int],
    max_required_horizon: int,
) -> tuple[list[BoundsTrainingRecord], dict[str, Any]]:
    records: list[BoundsTrainingRecord] = []
    eligible_cohorts = [
        cohort
        for cohort in cohorts
        if cohort.cohort_num_days > 0
        and cohort.cohort_size > 0
        and cohort.is_corrupted == 0
        and cohort.cohort_lifetime >= NOTEBOOK_HISTORY_MIN_DAY
        and len(cohort.total_revenue) >= NOTEBOOK_HISTORY_MIN_DAY
    ]
    total_curve_tasks = sum(
        1 for cohort in eligible_cohorts for cutoff in history_days if cutoff < len(cohort.total_revenue)
    )
    curve_count = 0

    for index, cohort in enumerate(eligible_cohorts, start=1):
        true_for: dict[int, float] = {}
        predicted_for_by_cutoff: dict[str, float] = {}
        bad_by_cutoff: set[int] = set()

        for period in prediction_periods:
            if len(cohort.total_revenue) > period and cohort.total_revenue[period] is not None:
                true_for[period] = float(cohort.total_revenue[period])

        for cutoff in history_days:
            if cutoff >= len(cohort.total_revenue):
                continue
            predicted_curve = estimate_curve(
                cohort.total_revenue,
                cutoff,
                max(360, max_required_horizon, 90),
            )
            curve_count += 1
            if curve_count % 500 == 0 or curve_count == total_curve_tasks:
                logger.info(
                    "curve fitting progress for %s: %d/%d tasks across %d eligible cohorts",
                    cohort.cohort_date,
                    curve_count,
                    total_curve_tasks,
                    len(eligible_cohorts),
                )
            if not predicted_curve:
                continue
            if predicted_curve[-1] < predicted_curve[-2]:
                continue
            if (predicted_curve[60] if len(predicted_curve) > 60 else 0) > (
                predicted_curve[90] if len(predicted_curve) > 90 else float("inf")
            ):
                bad_by_cutoff.add(cutoff)
            for period in prediction_periods:
                if cutoff < period < len(predicted_curve):
                    predicted_for_by_cutoff[bounds_key(period, cutoff)] = float(predicted_curve[period])

        if predicted_for_by_cutoff:
            records.append(
                BoundsTrainingRecord(
                    cohort_date=cohort.cohort_date,
                    cohort_size=cohort.cohort_size,
                    true_for=true_for,
                    predicted_for_by_cutoff=predicted_for_by_cutoff,
                    bad_by_cutoff=bad_by_cutoff,
                )
            )

        if index % 100 == 0 or index == len(eligible_cohorts):
            logger.info(
                "bounds training record progress: %d/%d eligible cohorts, kept=%d",
                index,
                len(eligible_cohorts),
                len(records),
            )

    diagnostics = {
        "eligibleCohortCount": len(eligible_cohorts),
        "curveTaskCount": total_curve_tasks,
        "curveTaskCompleted": curve_count,
        "keptTrainingRecordCount": len(records),
    }
    return records, diagnostics


def build_bounds_for_cohort_size(
    training_records: list[BoundsTrainingRecord],
    cohort_size: int,
    max_prediction_horizon: int,
    history_days: list[int],
    prediction_periods: list[int],
) -> dict[str, tuple[float, float]]:
    smooth_records = smooth_records_for_size(training_records, cohort_size)
    if len(smooth_records) < BOUNDS_MIN_PREDICTIONS:
        return {}

    table = get_error_bounds_from_records(smooth_records, history_days, prediction_periods)
    if not table:
        return {}

    expanded_history_max = min(BOUNDS_MAX_CUTOFF, max(history_days))
    for period in prediction_periods:
        known_cutoffs = [
            cutoff
            for cutoff in history_days
            if cutoff < period and bounds_key(period, cutoff) in table
        ]
        if not known_cutoffs:
            continue
        lower_values = [table[bounds_key(period, cutoff)][0] for cutoff in known_cutoffs]
        upper_values = [table[bounds_key(period, cutoff)][1] for cutoff in known_cutoffs]
        days_to_extend = min(expanded_history_max, period - 1)
        expanded = interpolate_across_history(
            known_cutoffs,
            lower_values,
            upper_values,
            days_to_extend,
        )
        for history_day, bounds in expanded.items():
            table.setdefault(bounds_key(period, history_day), bounds)

    full_prediction_periods = list(range(7, max_prediction_horizon + 1))
    for cutoff in range(NOTEBOOK_HISTORY_MIN_DAY, BOUNDS_MAX_CUTOFF + 1):
        known_periods = [
            period
            for period in prediction_periods
            if cutoff < period and bounds_key(period, cutoff) in table
        ]
        if len(known_periods) <= 1:
            continue
        lower_values = [table[bounds_key(period, cutoff)][0] for period in known_periods]
        upper_values = [table[bounds_key(period, cutoff)][1] for period in known_periods]
        expanded = interpolate_across_prediction_periods(
            known_periods,
            lower_values,
            upper_values,
            full_prediction_periods[-1],
        )
        for period, bounds in expanded.items():
            table.setdefault(bounds_key(period, cutoff), bounds)

    return table


def get_error_bounds_from_records(
    records: list[BoundsTrainingRecord],
    history_days: list[int],
    prediction_periods: list[int],
) -> dict[str, tuple[float, float]]:
    bounds: dict[str, tuple[float, float]] = {}
    for period in prediction_periods:
        for cutoff in history_days:
            if cutoff >= period:
                continue
            errors: list[float] = []
            for record in records:
                if cutoff in record.bad_by_cutoff:
                    continue
                actual = record.true_for.get(period)
                predicted = record.predicted_for_by_cutoff.get(bounds_key(period, cutoff))
                if actual is None or predicted is None or actual == 0:
                    continue
                error = ((actual - predicted) / actual) * 100
                if math.isfinite(error):
                    errors.append(error)
            if not errors:
                continue
            sorted_errors = sorted(errors)
            bounds[bounds_key(period, cutoff)] = (
                quantile(sorted_errors, 0.5),
                quantile(sorted_errors, 0.95),
            )
    return bounds


def smooth_records_for_size(
    training_records: list[BoundsTrainingRecord],
    cohort_size: int,
) -> list[BoundsTrainingRecord]:
    normalized_cohort_size = normalize_bounds_cohort_size(cohort_size)
    min_size = math.floor(normalized_cohort_size / BOUNDS_SIZE_SMOOTH_COEFF)
    max_size = math.ceil(normalized_cohort_size * BOUNDS_SIZE_SMOOTH_COEFF) + 1
    smooth_records = [
        record
        for record in training_records
        if min_size <= record.cohort_size <= max_size
    ]
    if (
        len(smooth_records) >= BOUNDS_MIN_PREDICTIONS
        or normalized_cohort_size > BOUNDS_SMALL_COHORT_NEAREST_FILL_MAX_SIZE
        or len(smooth_records) >= len(training_records)
    ):
        return smooth_records

    seen = {(record.cohort_date, record.cohort_size) for record in smooth_records}
    nearest_records = sorted(
        training_records,
        key=lambda record: (
            abs(
                math.log(max(record.cohort_size, 1))
                - math.log(max(normalized_cohort_size, 1))
            ),
            abs(record.cohort_size - normalized_cohort_size),
            record.cohort_date,
        ),
    )
    for record in nearest_records:
        key = (record.cohort_date, record.cohort_size)
        if key in seen:
            continue
        smooth_records.append(record)
        seen.add(key)
        if len(smooth_records) >= BOUNDS_MIN_PREDICTIONS:
            break
    return smooth_records


def smooth_record_count(
    training_records: list[BoundsTrainingRecord],
    cohort_size: int,
) -> int:
    return len(smooth_records_for_size(training_records, cohort_size))


def align_to_bucket(value: str, anchor: str, step_days: int) -> str:
    diff = day_diff(anchor, value)
    if diff < 0:
        bucket_index = -((-diff - 1) // step_days) - 1
    else:
        bucket_index = diff // step_days
    return add_days(anchor, bucket_index * step_days)


def interpolate_across_history(
    known_cutoffs: list[int],
    lower_values: list[float],
    upper_values: list[float],
    days_to_extend: int,
) -> dict[int, tuple[float, float]]:
    bounds: dict[int, tuple[float, float]] = {}
    first_cutoff = known_cutoffs[0] if known_cutoffs else None
    last_cutoff = known_cutoffs[-1] if known_cutoffs else None
    if first_cutoff is None or last_cutoff is None:
        return bounds

    interpolated_lower = [float("nan")] * (last_cutoff + 1)
    interpolated_upper = [float("nan")] * (last_cutoff + 1)
    for cutoff, lower, upper in zip(known_cutoffs, lower_values, upper_values):
        interpolated_lower[cutoff] = lower
        interpolated_upper[cutoff] = upper

    lower_series = interpolate_series(interpolated_lower[first_cutoff:])
    upper_series = interpolate_series(interpolated_upper[first_cutoff:])
    final_lower = lower_series
    final_upper = upper_series
    if days_to_extend > last_cutoff:
        extend_by = days_to_extend - last_cutoff
        base_window = max(1, math.trunc(last_cutoff / 3))
        final_lower = extrapolate_series(lower_series, base_window, extend_by)
        final_upper = extrapolate_series(upper_series, base_window, extend_by)

    for index, history_day in enumerate(range(first_cutoff, days_to_extend + 1)):
        bounds[history_day] = (
            float(final_lower[index] if index < len(final_lower) else 0),
            float(final_upper[index] if index < len(final_upper) else 0),
        )
    return bounds


def interpolate_across_prediction_periods(
    known_periods: list[int],
    lower_values: list[float],
    upper_values: list[float],
    max_prediction_horizon: int,
) -> dict[int, tuple[float, float]]:
    bounds: dict[int, tuple[float, float]] = {}
    first_period = known_periods[0] if known_periods else None
    last_period = known_periods[-1] if known_periods else None
    if first_period is None or last_period is None:
        return bounds

    interpolated_lower = [float("nan")] * (last_period + 1)
    interpolated_upper = [float("nan")] * (last_period + 1)
    for period, lower, upper in zip(known_periods, lower_values, upper_values):
        interpolated_lower[period] = lower
        interpolated_upper[period] = upper

    lower_series = interpolate_series(interpolated_lower[first_period:])
    upper_series = interpolate_series(interpolated_upper[first_period:])
    final_lower = lower_series
    final_upper = upper_series
    if max_prediction_horizon > last_period:
        extend_by = max_prediction_horizon - last_period
        base_window = max(1, math.trunc(last_period / 3))
        final_lower = extrapolate_series(lower_series, base_window, extend_by)
        final_upper = extrapolate_series(upper_series, base_window, extend_by)

    for index, period in enumerate(range(first_period, max_prediction_horizon + 1)):
        bounds[period] = (
            float(final_lower[index] if index < len(final_lower) else 0),
            float(final_upper[index] if index < len(final_upper) else 0),
        )
    return bounds


def serialize_bounds_artifact(bounds_table: dict[str, tuple[float, float]]) -> bytes:
    return pickle.dumps([bounds_table], protocol=pickle.HIGHEST_PROTOCOL)


def detect_corrupted_days(counts_by_day: dict[str, int], date_from: str, date_to: str) -> set[str]:
    start = date.fromisoformat(date_from)
    end = date.fromisoformat(date_to)
    counts: list[tuple[str, int]] = []
    cursor = start
    while cursor <= end:
        iso = cursor.isoformat()
        counts.append((iso, int(counts_by_day.get(iso, 0))))
        cursor += timedelta(days=1)

    corrupted: set[str] = set()
    for index, (iso_date, count) in enumerate(counts):
        window = counts[max(0, index - 2) : min(len(counts), index + 3)]
        mean_count = sum(item[1] for item in window) / max(1, len(window))
        if count == 0 or count < mean_count * 0.3:
            corrupted.add(iso_date)
    return corrupted


def day_diff(date_from: str, date_to: str) -> int:
    return max(0, (date.fromisoformat(date_to) - date.fromisoformat(date_from)).days)


def add_days(iso_date: str, days: int) -> str:
    return (date.fromisoformat(iso_date) + timedelta(days=days)).isoformat()


def interpolate_in_place(values: list[float]) -> None:
    left_index = -1
    for index in range(len(values)):
        if not math.isnan(values[index]):
            left_index = index
            continue

        right_index = index + 1
        while right_index < len(values) and math.isnan(values[right_index]):
            right_index += 1

        if left_index == -1 and right_index >= len(values):
            values[index] = 0.0
        elif left_index == -1:
            values[index] = values[right_index]
        elif right_index >= len(values):
            values[index] = values[left_index]
        else:
            span = right_index - left_index
            left_value = values[left_index]
            right_value = values[right_index]
            values[index] = left_value + ((right_value - left_value) * (index - left_index)) / span


def interpolate_series(values: list[float]) -> list[float]:
    interpolated = list(values)
    interpolate_in_place(interpolated)
    return [0.0 if math.isnan(value) else float(value) for value in interpolated]


def extrapolate_series(values: list[float], history_window: int, extend_by: int) -> list[float]:
    if not values or extend_by <= 0:
        return list(values)
    safe_window = max(1, min(history_window, len(values)))
    fit_values = values[-safe_window:]
    baseline = fit_values[0] if fit_values[0] != 0 else 1.0
    normalized = [value / baseline for value in fit_values]
    x_values = list(range(1, len(fit_values) + 1))
    sum_x = sum(x_values)
    sum_y = sum(normalized)
    sum_xy = sum(x * y for x, y in zip(x_values, normalized))
    sum_xx = sum(x * x for x in x_values)
    count = len(x_values)
    denominator = (count * sum_xx) - (sum_x * sum_x)
    slope = 0.0 if denominator == 0 else ((count * sum_xy) - (sum_x * sum_y)) / denominator
    intercept = 0.0 if count == 0 else (sum_y - (slope * sum_x)) / count
    extended = list(values)
    for index in range(1, extend_by + 1):
        x_value = len(fit_values) + index
        extended.append((baseline * ((slope * x_value) + intercept)) or 0.0)
    return extended


def safe_ratio_aggregate(values: list[float]) -> float:
    filtered = [value for value in values if math.isfinite(value)]
    if len(filtered) >= 3:
        mean = sum(filtered) / len(filtered)
        std = math.sqrt(sum((value - mean) ** 2 for value in filtered) / len(filtered))
        bounded = [value for value in filtered if abs(value - mean) < 2 * std]
        return float(median(bounded or filtered))
    if len(filtered) == 1:
        return float(filtered[0])
    if len(filtered) == 0:
        return 1.0
    return float(sum(filtered) / len(filtered))


def quantile(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        return 0.0
    position = (len(sorted_values) - 1) * q
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(sorted_values[lower])
    weight = position - lower
    return float((sorted_values[lower] * (1 - weight)) + (sorted_values[upper] * weight))
