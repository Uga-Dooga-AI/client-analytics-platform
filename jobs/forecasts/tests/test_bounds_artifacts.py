import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.bounds_artifacts import (  # noqa: E402
    BoundsTrainingRecord,
    RawCohortRecord,
    aggregate_raw_cohorts,
    artifact_relative_path,
    build_multigranularity_processed_cohorts,
    build_bounds_for_cohort_size,
    compress_size_ranges,
    get_error_bounds_from_records,
    process_raw_cohorts,
    smooth_record_count,
)


class BoundsArtifactsTest(unittest.TestCase):
    def test_smooth_record_count_respects_cohort_size_neighbors(self):
        records = [
            BoundsTrainingRecord(
                cohort_date=f"2026-01-{index + 1:02d}",
                cohort_size=size,
                true_for={7: 100.0},
                predicted_for_by_cutoff={"for_7_on_4": 95.0},
                bad_by_cutoff=set(),
            )
            for index, size in enumerate([282, 290, 295, 300, 305, 312, 320, 330, 340, 350])
        ]

        self.assertGreaterEqual(smooth_record_count(records, 300), 10)
        self.assertEqual(smooth_record_count(records, 1000), 0)

    def test_smooth_record_count_backfills_small_sizes_with_nearest_neighbors(self):
        records = [
            BoundsTrainingRecord(
                cohort_date=f"2026-01-{index + 1:02d}",
                cohort_size=size,
                true_for={7: 100.0},
                predicted_for_by_cutoff={"for_7_on_4": 95.0},
                bad_by_cutoff=set(),
            )
            for index, size in enumerate([1, 2, 3, 4, 6, 7, 19, 20, 26, 150])
        ]

        self.assertGreaterEqual(smooth_record_count(records, 47), 10)

    def test_bounds_table_stays_sparse_when_empirical_keys_are_missing(self):
        records = [
            BoundsTrainingRecord(
                cohort_date=f"2026-02-{index + 1:02d}",
                cohort_size=300,
                true_for={7: 100.0},
                predicted_for_by_cutoff={"for_7_on_4": 95.0},
                bad_by_cutoff=set(),
            )
            for index in range(10)
        ]

        bounds = build_bounds_for_cohort_size(
            records,
            cohort_size=300,
            max_prediction_horizon=30,
            history_days=[4],
            prediction_periods=[7, 8],
        )

        self.assertIn("for_7_on_4", bounds)
        self.assertNotIn("for_8_on_4", bounds)

    def test_small_cohort_bounds_expand_neighbors_until_empirical_keys_exist(self):
        invalid_records = [
            BoundsTrainingRecord(
                cohort_date=f"2026-03-{index + 1:02d}",
                cohort_size=size,
                true_for={7: 100.0},
                predicted_for_by_cutoff={"for_8_on_4": 95.0},
                bad_by_cutoff=set(),
            )
            for index, size in enumerate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        ]
        valid_record = BoundsTrainingRecord(
            cohort_date="2026-03-20",
            cohort_size=30,
            true_for={7: 100.0},
            predicted_for_by_cutoff={"for_7_on_4": 95.0},
            bad_by_cutoff=set(),
        )

        bounds = build_bounds_for_cohort_size(
            [*invalid_records, valid_record],
            cohort_size=11,
            max_prediction_horizon=30,
            history_days=[4],
            prediction_periods=[7],
        )

        self.assertIn("for_7_on_4", bounds)

    def test_error_bounds_use_lower_tail_not_median(self):
        records = [
            BoundsTrainingRecord(
                cohort_date=f"2026-04-{index + 1:02d}",
                cohort_size=300,
                true_for={7: 100.0},
                predicted_for_by_cutoff={"for_7_on_4": predicted},
                bad_by_cutoff=set(),
            )
            for index, predicted in enumerate(
                [160.0, 150.0, 145.0, 140.0, 135.0, 130.0, 120.0, 115.0, 110.0, 105.0, 100.0, 95.0]
            )
        ]

        bounds = get_error_bounds_from_records(records, history_days=[4], prediction_periods=[7])
        lower, upper = bounds["for_7_on_4"]

        self.assertLess(lower, -50.0)
        self.assertGreater(upper, -5.0)

    def test_compress_size_ranges_groups_consecutive_values(self):
        compressed = compress_size_ranges([1, 2, 3, 8, 10, 11])
        self.assertEqual(
            compressed,
            [
                {"from": 1, "to": 3},
                {"from": 8, "to": 8},
                {"from": 10, "to": 11},
            ],
        )

    def test_aggregate_raw_cohorts_builds_weekly_bucket_sizes(self):
        raw = [
            RawCohortRecord(
                cohort_date=f"2026-01-{index + 1:02d}",
                cohort_size=150,
                cohort_num_days=1,
                daily_revenue={0: 10.0 + index},
            )
            for index in range(7)
        ]

        weekly = aggregate_raw_cohorts(raw, step_days=7, anchor_date="2026-01-01")
        self.assertEqual(len(weekly), 1)
        self.assertEqual(weekly[0].cohort_size, 1050)
        self.assertEqual(weekly[0].cohort_num_days, 7)
        self.assertEqual(weekly[0].daily_revenue[0], sum(10.0 + index for index in range(7)))

    def test_process_raw_cohorts_preserves_bucket_day_count(self):
        raw = [
            RawCohortRecord(
                cohort_date="2026-01-01",
                cohort_size=900,
                cohort_num_days=7,
                daily_revenue={0: 100.0, 1: 60.0, 2: 30.0, 3: 10.0},
            )
        ]

        processed = process_raw_cohorts(raw, corrupted_days=set(), today_iso="2026-01-10")
        self.assertEqual(len(processed), 1)
        self.assertEqual(processed[0].cohort_num_days, 7)
        self.assertEqual(processed[0].cohort_size, 900)

    def test_multigranularity_processed_cohorts_stay_separated_by_step(self):
        raw = [
            RawCohortRecord(
                cohort_date=f"2026-01-{index + 1:02d}",
                cohort_size=20,
                cohort_num_days=1,
                daily_revenue={0: 10.0 + index},
            )
            for index in range(7)
        ]

        processed_by_granularity, diagnostics = build_multigranularity_processed_cohorts(
            raw,
            corrupted_days=set(),
            today_iso="2026-01-20",
            granularity_days=[1, 7],
        )

        self.assertEqual(diagnostics["processedCohortCountByGranularity"]["1"], 7)
        self.assertGreaterEqual(diagnostics["processedCohortCountByGranularity"]["7"], 1)
        self.assertEqual({1, 7}, set(processed_by_granularity.keys()))
        self.assertTrue(
            any(
                cohort.cohort_num_days == 7 and cohort.cohort_size == 140
                for cohort in processed_by_granularity[7]
            )
        )

    def test_artifact_relative_path_uses_granularity_subdirectories(self):
        self.assertEqual(artifact_relative_path(1, 64), "1d/64.pkl")
        self.assertEqual(artifact_relative_path(7, 1000), "7d/1000.pkl")


if __name__ == "__main__":
    unittest.main()
