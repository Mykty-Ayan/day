"""Unit tests for analytics repository helper functions (bucket generation)."""

from datetime import date

from app.domain.analytics.value_objects import Granularity
from app.infrastructure.repositories.analytics import _generate_buckets


class TestGenerateBucketsDay:
    def test_single_day(self):
        buckets = _generate_buckets(date(2025, 3, 1), date(2025, 3, 2), Granularity.DAY)
        assert len(buckets) == 1
        start, end, label = buckets[0]
        assert start == date(2025, 3, 1)
        assert end == date(2025, 3, 2)
        assert "Mar" in label

    def test_seven_days(self):
        buckets = _generate_buckets(date(2025, 3, 1), date(2025, 3, 8), Granularity.DAY)
        assert len(buckets) == 7
        # First bucket
        assert buckets[0][0] == date(2025, 3, 1)
        assert buckets[0][1] == date(2025, 3, 2)
        # Last bucket
        assert buckets[6][0] == date(2025, 3, 7)
        assert buckets[6][1] == date(2025, 3, 8)

    def test_thirty_days(self):
        buckets = _generate_buckets(date(2025, 1, 1), date(2025, 1, 31), Granularity.DAY)
        assert len(buckets) == 30

    def test_empty_range(self):
        buckets = _generate_buckets(date(2025, 3, 1), date(2025, 3, 1), Granularity.DAY)
        assert len(buckets) == 0

    def test_label_format(self):
        buckets = _generate_buckets(date(2025, 6, 15), date(2025, 6, 16), Granularity.DAY)
        assert buckets[0][2] == "Jun 15"

    def test_cross_month_boundary(self):
        buckets = _generate_buckets(date(2025, 1, 30), date(2025, 2, 2), Granularity.DAY)
        assert len(buckets) == 3
        assert buckets[0][0] == date(2025, 1, 30)
        assert buckets[1][0] == date(2025, 1, 31)
        assert buckets[2][0] == date(2025, 2, 1)

    def test_cross_year_boundary(self):
        buckets = _generate_buckets(date(2025, 12, 30), date(2026, 1, 2), Granularity.DAY)
        assert len(buckets) == 3
        assert buckets[0][0] == date(2025, 12, 30)
        assert buckets[2][0] == date(2026, 1, 1)


class TestGenerateBucketsWeek:
    def test_one_week(self):
        buckets = _generate_buckets(date(2025, 3, 1), date(2025, 3, 8), Granularity.WEEK)
        assert len(buckets) == 1
        assert buckets[0][0] == date(2025, 3, 1)
        assert buckets[0][1] == date(2025, 3, 8)

    def test_two_weeks(self):
        buckets = _generate_buckets(date(2025, 3, 1), date(2025, 3, 15), Granularity.WEEK)
        assert len(buckets) == 2

    def test_four_weeks(self):
        buckets = _generate_buckets(date(2025, 3, 1), date(2025, 3, 29), Granularity.WEEK)
        assert len(buckets) == 4

    def test_partial_week_at_end(self):
        # 10 days = 1 full week + 3 day partial
        buckets = _generate_buckets(date(2025, 3, 1), date(2025, 3, 11), Granularity.WEEK)
        assert len(buckets) == 2
        # Second bucket is partial
        assert buckets[1][0] == date(2025, 3, 8)
        assert buckets[1][1] == date(2025, 3, 11)

    def test_label_contains_range(self):
        buckets = _generate_buckets(date(2025, 3, 1), date(2025, 3, 8), Granularity.WEEK)
        label = buckets[0][2]
        assert "Mar 01" in label
        assert "Mar 07" in label


class TestGenerateBucketsMonth:
    def test_single_month(self):
        buckets = _generate_buckets(date(2025, 3, 1), date(2025, 4, 1), Granularity.MONTH)
        assert len(buckets) == 1
        assert buckets[0][0] == date(2025, 3, 1)
        assert buckets[0][1] == date(2025, 4, 1)

    def test_three_months(self):
        buckets = _generate_buckets(date(2025, 1, 1), date(2025, 4, 1), Granularity.MONTH)
        assert len(buckets) == 3
        assert buckets[0][0] == date(2025, 1, 1)
        assert buckets[1][0] == date(2025, 2, 1)
        assert buckets[2][0] == date(2025, 3, 1)

    def test_twelve_months(self):
        buckets = _generate_buckets(date(2025, 1, 1), date(2026, 1, 1), Granularity.MONTH)
        assert len(buckets) == 12

    def test_partial_month_at_end(self):
        buckets = _generate_buckets(date(2025, 1, 1), date(2025, 2, 15), Granularity.MONTH)
        assert len(buckets) == 2
        # Second bucket is partial
        assert buckets[1][0] == date(2025, 2, 1)
        assert buckets[1][1] == date(2025, 2, 15)

    def test_december_to_january(self):
        buckets = _generate_buckets(date(2025, 12, 1), date(2026, 2, 1), Granularity.MONTH)
        assert len(buckets) == 2
        assert buckets[0][0] == date(2025, 12, 1)
        assert buckets[0][1] == date(2026, 1, 1)
        assert buckets[1][0] == date(2026, 1, 1)
        assert buckets[1][1] == date(2026, 2, 1)

    def test_label_format(self):
        buckets = _generate_buckets(date(2025, 6, 1), date(2025, 7, 1), Granularity.MONTH)
        assert buckets[0][2] == "Jun 2025"

    def test_month_start_mid_month(self):
        # Starting mid-month: first bucket runs from 15th to end of month
        buckets = _generate_buckets(date(2025, 3, 15), date(2025, 5, 1), Granularity.MONTH)
        assert len(buckets) == 2
        assert buckets[0][0] == date(2025, 3, 15)
        assert buckets[0][1] == date(2025, 4, 1)
        assert buckets[1][0] == date(2025, 4, 1)
        assert buckets[1][1] == date(2025, 5, 1)


class TestBucketsContinuity:
    """Verify that bucket ranges are contiguous (no gaps, no overlaps)."""

    def test_day_buckets_contiguous(self):
        buckets = _generate_buckets(date(2025, 1, 1), date(2025, 1, 15), Granularity.DAY)
        for i in range(len(buckets) - 1):
            assert buckets[i][1] == buckets[i + 1][0], (
                f"Gap between bucket {i} end {buckets[i][1]} and bucket {i+1} start {buckets[i+1][0]}"
            )

    def test_week_buckets_contiguous(self):
        buckets = _generate_buckets(date(2025, 1, 1), date(2025, 3, 1), Granularity.WEEK)
        for i in range(len(buckets) - 1):
            assert buckets[i][1] == buckets[i + 1][0]

    def test_month_buckets_contiguous(self):
        buckets = _generate_buckets(date(2025, 1, 1), date(2026, 1, 1), Granularity.MONTH)
        for i in range(len(buckets) - 1):
            assert buckets[i][1] == buckets[i + 1][0]

    def test_day_buckets_cover_full_range(self):
        start, end = date(2025, 1, 1), date(2025, 1, 10)
        buckets = _generate_buckets(start, end, Granularity.DAY)
        assert buckets[0][0] == start
        assert buckets[-1][1] == end

    def test_week_buckets_cover_full_range(self):
        start, end = date(2025, 1, 1), date(2025, 2, 1)
        buckets = _generate_buckets(start, end, Granularity.WEEK)
        assert buckets[0][0] == start
        assert buckets[-1][1] == end

    def test_month_buckets_cover_full_range(self):
        start, end = date(2025, 1, 1), date(2025, 7, 1)
        buckets = _generate_buckets(start, end, Granularity.MONTH)
        assert buckets[0][0] == start
        assert buckets[-1][1] == end
