"""Unit tests for analytics domain entities and value objects."""

import uuid
from datetime import date
from decimal import Decimal

from app.domain.analytics.entities import (
    AnalyticsSummary,
    PropertyMetrics,
    TimeSeriesPoint,
)
from app.domain.analytics.value_objects import Granularity, PeriodPreset

# ---------- Value Objects ----------


class TestPeriodPreset:
    def test_all_presets_exist(self):
        assert PeriodPreset.WEEK == "week"
        assert PeriodPreset.MONTH == "month"
        assert PeriodPreset.QUARTER == "quarter"
        assert PeriodPreset.YEAR == "year"
        assert PeriodPreset.CUSTOM == "custom"

    def test_preset_count(self):
        assert len(PeriodPreset) == 5

    def test_preset_is_string_enum(self):
        assert isinstance(PeriodPreset.WEEK, str)
        assert PeriodPreset.WEEK == "week"


class TestGranularity:
    def test_all_granularities_exist(self):
        assert Granularity.DAY == "day"
        assert Granularity.WEEK == "week"
        assert Granularity.MONTH == "month"

    def test_granularity_count(self):
        assert len(Granularity) == 3

    def test_granularity_is_string_enum(self):
        assert isinstance(Granularity.DAY, str)


# ---------- Entities ----------


class TestPropertyMetrics:
    def test_default_values(self):
        pm = PropertyMetrics()
        assert pm.property_name == ""
        assert pm.property_internal_name == ""
        assert pm.revenue == Decimal("0")
        assert pm.adr == Decimal("0")
        assert pm.revpar == Decimal("0")
        assert pm.expenses == Decimal("0")
        assert pm.profit == Decimal("0")
        assert pm.commission == Decimal("0")
        assert pm.vacancy_days == 0
        assert pm.occupancy_rate == Decimal("0")
        assert pm.avg_stay_duration == Decimal("0")
        assert pm.total_bookings == 0
        assert pm.booked_nights == 0

    def test_custom_values(self):
        pid = uuid.uuid4()
        pm = PropertyMetrics(
            property_id=pid,
            property_name="Beach House",
            property_internal_name="beach-1",
            revenue=Decimal("5000"),
            adr=Decimal("250"),
            revpar=Decimal("166.67"),
            expenses=Decimal("500"),
            profit=Decimal("4500"),
            commission=Decimal("500"),
            vacancy_days=10,
            occupancy_rate=Decimal("66.67"),
            avg_stay_duration=Decimal("3.5"),
            total_bookings=6,
            booked_nights=20,
        )
        assert pm.property_id == pid
        assert pm.revenue == Decimal("5000")
        assert pm.total_bookings == 6

    def test_property_id_is_auto_generated(self):
        pm1 = PropertyMetrics()
        pm2 = PropertyMetrics()
        assert pm1.property_id != pm2.property_id


class TestTimeSeriesPoint:
    def test_default_values(self):
        p = TimeSeriesPoint()
        assert p.period_start is None
        assert p.period_label == ""
        assert p.revenue == Decimal("0")
        assert p.bookings_count == 0
        assert p.booked_nights == 0
        assert p.occupancy_rate == Decimal("0")

    def test_custom_values(self):
        p = TimeSeriesPoint(
            period_start=date(2025, 6, 1),
            period_label="Jun 01",
            revenue=Decimal("1000"),
            bookings_count=3,
            booked_nights=5,
            occupancy_rate=Decimal("83.33"),
        )
        assert p.period_start == date(2025, 6, 1)
        assert p.period_label == "Jun 01"
        assert p.revenue == Decimal("1000")
        assert p.bookings_count == 3


class TestAnalyticsSummary:
    def test_default_values(self):
        s = AnalyticsSummary()
        assert s.total_revenue == Decimal("0")
        assert s.total_expenses == Decimal("0")
        assert s.total_profit == Decimal("0")
        assert s.total_commission == Decimal("0")
        assert s.overall_adr == Decimal("0")
        assert s.overall_revpar == Decimal("0")
        assert s.overall_occupancy_rate == Decimal("0")
        assert s.avg_stay_duration == Decimal("0")
        assert s.total_bookings == 0
        assert s.total_booked_nights == 0
        assert s.total_vacancy_days == 0
        assert s.properties_count == 0

    def test_all_fields_writable(self):
        s = AnalyticsSummary()
        s.total_revenue = Decimal("10000")
        s.total_bookings = 42
        s.properties_count = 5
        assert s.total_revenue == Decimal("10000")
        assert s.total_bookings == 42
        assert s.properties_count == 5
