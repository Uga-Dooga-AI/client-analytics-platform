import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.bounds_artifacts import (  # noqa: E402
    BoundsTrainingRecord,
    build_bounds_for_cohort_size,
    compress_size_ranges,
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


if __name__ == "__main__":
    unittest.main()
