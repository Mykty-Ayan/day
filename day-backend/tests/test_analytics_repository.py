"""Unit tests for analytics repository helper functions (bucket generation)
plus integration tests for interval-safe day math and sub-day proration."""

import contextlib
import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.domain.analytics.value_objects import Granularity
from app.infrastructure.models.booking import (
    BookingModel,
    BookingPaymentModel,
    GuestModel,
)
from app.infrastructure.models.property import PropertyModel
from app.infrastructure.repositories.analytics import (
    SqlAnalyticsRepository,
    _generate_buckets,
)


@contextlib.asynccontextmanager
async def _fresh_session():
    """A session backed by a throwaway NullPool engine bound to the running
    event loop. pytest-asyncio gives each test its own loop, so we cannot share
    the app's module-level pooled engine across tests without cross-loop errors.
    """
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with maker() as session:
            yield session
    finally:
        await engine.dispose()


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


# ---------------------------------------------------------------------------
# Integration: interval-safe day math + sub-day (hourly) revenue proration.
# These need a live Postgres (deselected by default via the `integration` mark).
# Each test seeds rows inside a transaction and rolls back so the DB stays clean.
# ---------------------------------------------------------------------------

pytestmark_integration = pytest.mark.integration

DATE_FROM = date(2025, 6, 1)
DATE_TO = date(2025, 6, 30)  # (DATE_TO - DATE_FROM).days == 29


def _guest(company_id: uuid.UUID) -> GuestModel:
    return GuestModel(id=uuid.uuid4(), company_id=company_id, name="Test Guest")


def _property(company_id: uuid.UUID, internal: str, mode: str) -> PropertyModel:
    return PropertyModel(
        id=uuid.uuid4(),
        company_id=company_id,
        name=f"Prop {internal}",
        internal_name=internal,
        type="apartment",
        status="active",
        rental_mode=mode,
    )


def _booking(
    company_id: uuid.UUID,
    property_id: uuid.UUID,
    guest_id: uuid.UUID,
    check_in: datetime,
    check_out: datetime,
    price: str,
    mode: str,
) -> BookingModel:
    return BookingModel(
        id=uuid.uuid4(),
        company_id=company_id,
        property_id=property_id,
        guest_id=guest_id,
        check_in=check_in,
        check_out=check_out,
        rental_mode=mode,
        source="direct",
        status="confirmed",
        total_price=Decimal(price),
    )


def _payment(booking_id: uuid.UUID, amount: str) -> BookingPaymentModel:
    return BookingPaymentModel(
        id=uuid.uuid4(),
        booking_id=booking_id,
        amount=Decimal(amount),
        type="payment",
        method="cash",
        status="completed",
    )


@pytestmark_integration
@pytest.mark.asyncio
async def test_metrics_mixed_hourly_and_daily_does_not_raise_and_prorates():
    """One 3-hour booking + one 2-night booking: no interval-cast crash, revenue
    attributed in full, and occupancy is a sane fractional value."""
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest = _guest(company_id)
        prop = _property(company_id, f"mixed-{uuid.uuid4().hex[:8]}", "mixed")
        # 2-night daily booking, backfilled 14:00/12:00 default times.
        b_daily = _booking(
            company_id, prop.id, guest.id,
            datetime(2025, 6, 10, 14, 0), datetime(2025, 6, 12, 12, 0),
            "200", "daily",
        )
        # 3-hour hourly booking, entirely within a single calendar day.
        b_hourly = _booking(
            company_id, prop.id, guest.id,
            datetime(2025, 6, 15, 10, 0), datetime(2025, 6, 15, 13, 0),
            "60", "hourly",
        )
        session.add_all([
            guest, prop, b_daily, b_hourly,
            _payment(b_daily.id, "200"), _payment(b_hourly.id, "60"),
        ])
        await session.flush()

        repo = SqlAnalyticsRepository(session)
        metrics = await repo.get_property_metrics(
            company_id, DATE_FROM, DATE_TO, property_ids=[prop.id]
        )

        assert len(metrics) == 1
        pm = metrics[0]
        assert pm.total_bookings == 2
        # 2 whole nights (daily) + 3h/24 = 0.125 day (hourly) = 2.125 booked days.
        assert abs(pm.booked_nights - Decimal("2.125")) < Decimal("0.001")
        # Both bookings' payments attributed in full.
        assert pm.revenue == Decimal("260")
        # Occupancy is sane: strictly positive and well under 100%.
        assert Decimal("0") < pm.occupancy_rate < Decimal("100")
        # ADR = revenue / booked days (guarded against fractional denominators).
        assert abs(pm.adr - (Decimal("260") / Decimal("2.125"))) < Decimal("0.01")

        await session.rollback()


@pytestmark_integration
@pytest.mark.asyncio
async def test_metrics_empty_property_has_zero_occupancy():
    """Regression: a property with NO bookings in the period must report 0 booked
    days / 0% occupancy. The LEFT JOIN yields a NULL-booking row and Postgres
    greatest()/least() ignore NULLs, which previously collapsed the clamp to the
    whole period and reported 100% occupancy for empty properties."""
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        prop = _property(company_id, f"empty-{uuid.uuid4().hex[:8]}", "daily")
        session.add(prop)
        await session.flush()

        repo = SqlAnalyticsRepository(session)
        metrics = await repo.get_property_metrics(
            company_id, DATE_FROM, DATE_TO, property_ids=[prop.id]
        )

        assert len(metrics) == 1
        pm = metrics[0]
        assert pm.total_bookings == 0
        assert pm.booked_nights == Decimal("0")
        assert pm.occupancy_rate == Decimal("0")
        assert pm.revenue == Decimal("0")

        await session.rollback()


@pytestmark_integration
@pytest.mark.asyncio
async def test_metrics_pure_daily_regression_matches_date_diff_baseline():
    """Pure-daily dataset must regression-match the pre-timestamp numbers:
    booked_nights is the whole-night date diff, ADR = revenue / nights."""
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest = _guest(company_id)
        prop = _property(company_id, f"daily-{uuid.uuid4().hex[:8]}", "daily")
        b1 = _booking(  # 3 nights
            company_id, prop.id, guest.id,
            datetime(2025, 6, 1, 0, 0), datetime(2025, 6, 4, 0, 0),
            "300", "daily",
        )
        b2 = _booking(  # 5 nights
            company_id, prop.id, guest.id,
            datetime(2025, 6, 20, 0, 0), datetime(2025, 6, 25, 0, 0),
            "500", "daily",
        )
        session.add_all([
            guest, prop, b1, b2,
            _payment(b1.id, "300"), _payment(b2.id, "500"),
        ])
        await session.flush()

        repo = SqlAnalyticsRepository(session)
        metrics = await repo.get_property_metrics(
            company_id, DATE_FROM, DATE_TO, property_ids=[prop.id]
        )

        assert len(metrics) == 1
        pm = metrics[0]
        assert pm.total_bookings == 2
        # 3 + 5 = 8 whole nights, identical to the pre-timestamp date-diff.
        assert pm.booked_nights == Decimal("8")
        assert pm.revenue == Decimal("800")
        assert pm.adr == Decimal("100")  # 800 / 8
        # occupancy = 8 / 29 * 100
        assert pm.occupancy_rate == (Decimal("8") / Decimal("29") * 100).quantize(
            pm.occupancy_rate
        )

        await session.rollback()


@pytestmark_integration
@pytest.mark.asyncio
async def test_time_series_attributes_sub_day_revenue_to_its_bucket():
    """A 3-hour booking must attribute its full price (and a fractional day of
    occupancy) to the day bucket it falls in, instead of dropping to zero."""
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest = _guest(company_id)
        prop = _property(company_id, f"ts-{uuid.uuid4().hex[:8]}", "mixed")
        b_daily = _booking(
            company_id, prop.id, guest.id,
            datetime(2025, 6, 10, 14, 0), datetime(2025, 6, 12, 12, 0),
            "200", "daily",
        )
        b_hourly = _booking(
            company_id, prop.id, guest.id,
            datetime(2025, 6, 15, 10, 0), datetime(2025, 6, 15, 13, 0),
            "60", "hourly",
        )
        session.add_all([guest, prop, b_daily, b_hourly])
        await session.flush()

        repo = SqlAnalyticsRepository(session)
        points = await repo.get_time_series(
            company_id, DATE_FROM, DATE_TO, Granularity.DAY, property_ids=[prop.id]
        )

        by_day = {p.period_start: p for p in points}
        # Sub-day booking: full price in its bucket, fractional-day occupancy.
        jun15 = by_day[date(2025, 6, 15)]
        assert jun15.revenue == Decimal("60.00")
        assert jun15.bookings_count == 1
        assert abs(jun15.booked_nights - Decimal("0.125")) < Decimal("0.001")
        # Daily booking: whole-night proration, 100 per night across two buckets.
        assert by_day[date(2025, 6, 10)].revenue == Decimal("100.00")
        assert by_day[date(2025, 6, 11)].revenue == Decimal("100.00")
        assert by_day[date(2025, 6, 10)].booked_nights == Decimal("1.0000")

        await session.rollback()
