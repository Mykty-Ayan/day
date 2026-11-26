"""Unit tests for analytics repository helper functions (bucket generation)
plus integration tests for interval-safe day math and sub-day proration."""

import contextlib
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.domain.analytics.value_objects import Granularity
from app.infrastructure.models.booking import (
    BookingDepositModel,
    BookingModel,
    BookingPaymentModel,
    GuestModel,
)
from app.infrastructure.models.property import PropertyModel
from app.infrastructure.repositories.analytics import (
    SqlAnalyticsRepository,
    _generate_buckets,
)
from app.infrastructure.repositories.booking import SqlBookingPaymentRepository


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
        # Long before any test's stays: a flat counts in occupancy from the day it came in.
        created_at=datetime(2020, 1, 1),
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


def _at(payment: BookingPaymentModel, paid_at: datetime) -> BookingPaymentModel:
    payment.paid_at = paid_at
    return payment


def _refund(booking_id: uuid.UUID, amount: str) -> BookingPaymentModel:
    payment = _payment(booking_id, amount)
    payment.type = "refund"
    return payment


def _pending(booking_id: uuid.UUID, amount: str) -> BookingPaymentModel:
    payment = _payment(booking_id, amount)
    payment.status = "pending"
    payment.paid_at = datetime(2025, 6, 10, 2)
    return payment


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


def _refund(booking_id: uuid.UUID, amount: str) -> BookingPaymentModel:
    payment = _payment(booking_id, amount)
    payment.type = "refund"
    return payment


def _cancelled(booking: BookingModel) -> BookingModel:
    booking.status = "cancelled"
    return booking


@pytestmark_integration
@pytest.mark.asyncio
async def test_a_kept_prepayment_is_income_but_not_a_stay():
    """A guest cancelled and the host kept the prepayment: the money counts, the
    nights do not, and the average price of a night is not lifted by it."""
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest = _guest(company_id)
        prop = _property(company_id, f"kept-{uuid.uuid4().hex[:8]}", "daily")
        stay = _booking(
            company_id, prop.id, guest.id, datetime(2025, 6, 1), datetime(2025, 6, 3), "200", "daily"
        )
        kept = _cancelled(_booking(
            company_id, prop.id, guest.id, datetime(2025, 6, 10), datetime(2025, 6, 12), "200", "daily"
        ))
        refunded = _cancelled(_booking(
            company_id, prop.id, guest.id, datetime(2025, 6, 14), datetime(2025, 6, 16), "200", "daily"
        ))
        outside = _cancelled(_booking(
            company_id, prop.id, guest.id, datetime(2025, 8, 1), datetime(2025, 8, 3), "200", "daily"
        ))
        session.add_all([
            guest, prop, stay, kept, refunded, outside,
            _payment(stay.id, "200"), _payment(kept.id, "50"),
            _payment(refunded.id, "70"), _refund(refunded.id, "70"), _payment(outside.id, "90"),
        ])
        await session.flush()

        [pm] = await SqlAnalyticsRepository(session).get_property_metrics(
            company_id, DATE_FROM, DATE_TO, property_ids=[prop.id]
        )

        assert pm.revenue == Decimal("250")
        assert pm.retained_prepayments == Decimal("50")
        assert pm.total_bookings == 1
        assert pm.booked_nights == Decimal("2")
        assert pm.adr == Decimal("100")  # 200 / 2: the stay alone
        assert pm.revpar == Decimal("200") / Decimal("29")

        await session.rollback()


@pytestmark_integration
@pytest.mark.asyncio
async def test_money_received_today_stays_inside_the_company_and_the_day():
    company_id = uuid.uuid4()
    start, end = datetime(2025, 6, 9, 19), datetime(2025, 6, 10, 19)
    async with _fresh_session() as session:
        guest, other_guest = _guest(company_id), _guest(uuid.uuid4())
        prop = _property(company_id, f"day-{uuid.uuid4().hex[:8]}", "daily")
        other = _property(other_guest.company_id, f"day-{uuid.uuid4().hex[:8]}", "daily")
        stay = _booking(company_id, prop.id, guest.id, datetime(2025, 6, 10), datetime(2025, 6, 12), "900", "daily")
        foreign = _booking(
            other_guest.company_id, other.id, other_guest.id,
            datetime(2025, 6, 10), datetime(2025, 6, 12), "900", "daily",
        )
        session.add_all([guest, other_guest, prop, other, stay, foreign])
        await session.flush()

        session.add_all([
            _at(_payment(stay.id, "100"), start),
            _at(_payment(stay.id, "50"), end - timedelta(seconds=1)),
            _at(_refund(stay.id, "30"), start + timedelta(hours=1)),
            _at(_payment(stay.id, "7"), end),  # the next day
            _at(_payment(stay.id, "9"), start - timedelta(seconds=1)),  # the day before
            _at(_payment(foreign.id, "1000"), start + timedelta(hours=1)),  # another company
            _pending(stay.id, "5"),
        ])
        await session.flush()

        received = await SqlBookingPaymentRepository(session).sum_received_between(company_id, start, end)

        assert received == Decimal("120")
        await session.rollback()


@pytestmark_integration
@pytest.mark.asyncio
async def test_several_sources_count_together_and_the_others_stay_out():
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest = _guest(company_id)
        prop = _property(company_id, f"src-{uuid.uuid4().hex[:8]}", "daily")
        direct = _booking(company_id, prop.id, guest.id, datetime(2025, 6, 1), datetime(2025, 6, 3), "100", "daily")
        airbnb = _booking(company_id, prop.id, guest.id, datetime(2025, 6, 5), datetime(2025, 6, 7), "200", "daily")
        booking = _booking(company_id, prop.id, guest.id, datetime(2025, 6, 9), datetime(2025, 6, 11), "400", "daily")
        airbnb.source, booking.source = "airbnb", "booking"
        session.add_all([guest, prop, direct, airbnb, booking])
        await session.flush()
        repo = SqlAnalyticsRepository(session)

        [both] = await repo.get_property_metrics(company_id, DATE_FROM, DATE_TO, source=["direct", "airbnb"])
        [alone] = await repo.get_property_metrics(company_id, DATE_FROM, DATE_TO, source=["booking"])
        series = await repo.get_time_series(
            company_id, DATE_FROM, DATE_TO, Granularity.MONTH, source=["direct", "airbnb"]
        )

        assert both.revenue == Decimal("300")
        assert alone.revenue == Decimal("400")
        assert sum(point.revenue for point in series) == Decimal("300")
        await session.rollback()


@pytestmark_integration
@pytest.mark.asyncio
async def test_a_kept_prepayment_stays_inside_its_company_and_source():
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest, other_guest = _guest(company_id), _guest(uuid.uuid4())
        prop = _property(company_id, f"kept-{uuid.uuid4().hex[:8]}", "daily")
        other = _property(other_guest.company_id, f"kept-{uuid.uuid4().hex[:8]}", "daily")
        kept = _cancelled(_booking(
            company_id, prop.id, guest.id, datetime(2025, 6, 10), datetime(2025, 6, 12), "200", "daily"
        ))
        foreign = _cancelled(_booking(
            other_guest.company_id, other.id, other_guest.id,
            datetime(2025, 6, 10), datetime(2025, 6, 12), "200", "daily",
        ))
        stay = _booking(company_id, prop.id, guest.id, datetime(2025, 6, 1), datetime(2025, 6, 3), "200", "daily")
        session.add_all([guest, other_guest, prop, other, stay, kept, foreign])
        session.add_all([_payment(kept.id, "50"), _payment(foreign.id, "60")])
        await session.flush()
        repo = SqlAnalyticsRepository(session)

        [pm] = await repo.get_property_metrics(company_id, DATE_FROM, DATE_TO)
        by_source = await repo.get_property_metrics(company_id, DATE_FROM, DATE_TO, source=["direct"])
        no_source = await repo.get_property_metrics(company_id, DATE_FROM, DATE_TO, source=["airbnb"])

        # The stay's price (paid or not: the guests' debt is in the payments) and the money kept.
        assert pm.revenue == Decimal("250")
        assert [m.revenue for m in by_source] == [Decimal("250")]
        # A source with no stays earns the flat nothing, kept money or not; the flat stays on the
        # list, its nights on offer.
        assert [(m.revenue, m.total_bookings) for m in no_source] == [(Decimal("0"), 0)]

        await session.rollback()


@pytestmark_integration
@pytest.mark.asyncio
async def test_a_stay_earns_its_price_night_by_night():
    """A stay across the period's edge counts its nights in the period, not its whole price;
    an unpaid stay counts its price as a paid one does. Two periods side by side add up to
    the price, and the metrics agree with the time series."""
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest = _guest(company_id)
        prop = _property(company_id, f"nights-{uuid.uuid4().hex[:8]}", "daily")
        # 4 nights, 28 June – 2 July: 3 in June (28, 29, 30), 1 in July. Paid in full.
        across = _booking(
            company_id, prop.id, guest.id, datetime(2025, 6, 28, 14), datetime(2025, 7, 2, 12), "400", "daily"
        )
        # 2 nights in June, nothing paid yet.
        unpaid = _booking(
            company_id, prop.id, guest.id, datetime(2025, 6, 10, 14), datetime(2025, 6, 12, 12), "300", "daily"
        )
        # Cancelled, 30 June – 2 July, 80 kept: 40 for June's night.
        kept = _cancelled(_booking(
            company_id, prop.id, guest.id, datetime(2025, 6, 30), datetime(2025, 7, 2), "200", "daily"
        ))
        session.add_all([guest, prop, across, unpaid, kept, _payment(across.id, "400"), _payment(kept.id, "80")])
        await session.flush()
        repo = SqlAnalyticsRepository(session)
        june, july = (date(2025, 6, 1), date(2025, 7, 1)), (date(2025, 7, 1), date(2025, 8, 1))

        [in_june] = await repo.get_property_metrics(company_id, *june, property_ids=[prop.id])
        [in_july] = await repo.get_property_metrics(company_id, *july, property_ids=[prop.id])

        assert in_june.revenue == Decimal("640")  # 300 of the stay across + 300 unpaid + 40 kept
        assert in_july.revenue == Decimal("140")  # 100 + 40
        assert in_june.revenue + in_july.revenue == Decimal("780")  # 400 + 300 + 80: nothing twice
        assert in_june.retained_prepayments == Decimal("40")
        # The price of a night is the stays' own: 600 for 5 nights, the kept money left out.
        assert in_june.booked_nights == Decimal("5")
        assert in_june.adr == Decimal("120")

        series = await repo.get_time_series(company_id, *june, Granularity.MONTH, property_ids=[prop.id])
        assert sum(point.revenue for point in series) == in_june.revenue
        assert series[0].bookings_count == 2  # the cancelled booking is no stay
        assert series[0].booked_nights == Decimal("5")

        await session.rollback()


@pytestmark_integration
@pytest.mark.asyncio
async def test_an_hourly_stay_across_midnight_is_split_by_its_hours():
    """22:00 to 02:00 for 400: two hours in each day, 200 in each, in the cards and the chart."""
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest = _guest(company_id)
        prop = _property(company_id, f"late-{uuid.uuid4().hex[:8]}", "hourly")
        late = _booking(
            company_id, prop.id, guest.id, datetime(2025, 6, 30, 22), datetime(2025, 7, 1, 2), "400", "hourly"
        )
        session.add_all([guest, prop, late])
        await session.flush()
        repo = SqlAnalyticsRepository(session)

        [june] = await repo.get_property_metrics(company_id, date(2025, 6, 1), date(2025, 7, 1), property_ids=[prop.id])
        [july] = await repo.get_property_metrics(company_id, date(2025, 7, 1), date(2025, 8, 1), property_ids=[prop.id])
        assert (june.revenue, july.revenue) == (Decimal("200"), Decimal("200"))
        assert abs(june.booked_nights - Decimal(2) / Decimal(24)) < Decimal("0.0001")

        days = await repo.get_time_series(
            company_id, date(2025, 6, 30), date(2025, 7, 2), Granularity.DAY, property_ids=[prop.id]
        )
        assert [point.revenue for point in days] == [Decimal("200.00"), Decimal("200.00")]

        await session.rollback()


@pytestmark_integration
@pytest.mark.asyncio
async def test_money_kept_from_a_source_counts_with_that_source_alone():
    """A flat whose only booking from Booking.com was cancelled with money kept: under that
    source the cards count the money, as the chart does."""
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest = _guest(company_id)
        prop = _property(company_id, f"src-{uuid.uuid4().hex[:8]}", "daily")
        kept = _cancelled(_booking(
            company_id, prop.id, guest.id, datetime(2025, 6, 10), datetime(2025, 6, 12), "200", "daily"
        ))
        kept.source = "booking"
        stay = _booking(company_id, prop.id, guest.id, datetime(2025, 6, 1), datetime(2025, 6, 3), "300", "daily")
        session.add_all([guest, prop, kept, stay, _payment(kept.id, "100")])
        await session.flush()
        repo = SqlAnalyticsRepository(session)

        [pm] = await repo.get_property_metrics(company_id, DATE_FROM, DATE_TO, source=["booking"])
        series = await repo.get_time_series(company_id, DATE_FROM, DATE_TO, Granularity.MONTH, source=["booking"])

        assert pm.revenue == Decimal("100")
        assert pm.retained_prepayments == Decimal("100")
        assert pm.total_bookings == 0
        assert pm.commission == Decimal("15.00")
        assert sum(point.revenue for point in series) == pm.revenue

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


@pytestmark_integration
@pytest.mark.asyncio
async def test_the_revenue_is_split_by_where_the_bookings_came_from():
    """Each source's money and the platform's cut; a kept prepayment counts to its
    source, and another company's bookings to none."""
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest, stranger = _guest(company_id), _guest(uuid.uuid4())
        prop = _property(company_id, f"src-{uuid.uuid4().hex[:8]}", "daily")
        other = _property(stranger.company_id, f"src-{uuid.uuid4().hex[:8]}", "daily")
        direct = _booking(company_id, prop.id, guest.id, datetime(2025, 6, 1), datetime(2025, 6, 3), "200", "daily")
        airbnb = _booking(company_id, prop.id, guest.id, datetime(2025, 6, 5), datetime(2025, 6, 7), "300", "daily")
        airbnb.source = "airbnb"
        kept = _cancelled(
            _booking(company_id, prop.id, guest.id, datetime(2025, 6, 10), datetime(2025, 6, 12), "400", "daily")
        )
        kept.source = "booking"
        foreign = _booking(
            stranger.company_id, other.id, stranger.id, datetime(2025, 6, 1), datetime(2025, 6, 3), "900", "daily"
        )
        foreign.source = "airbnb"
        session.add_all([
            guest, stranger, prop, other, direct, airbnb, kept, foreign,
            _payment(direct.id, "200"), _payment(airbnb.id, "300"), _payment(kept.id, "100"),
            _payment(foreign.id, "900"),
        ])
        await session.flush()

        [pm] = await SqlAnalyticsRepository(session).get_property_metrics(company_id, DATE_FROM, DATE_TO)

        assert set(pm.by_source) == {"direct", "airbnb", "booking"}
        assert (pm.by_source["direct"].revenue, pm.by_source["direct"].commission) == (Decimal("200"), 0)
        assert pm.by_source["airbnb"].revenue == Decimal("300")
        assert pm.by_source["airbnb"].commission == Decimal("9")  # 3%
        assert pm.by_source["airbnb"].bookings == 1
        # The kept prepayment: money of Booking.com's guest, no stay.
        assert pm.by_source["booking"].revenue == Decimal("100")
        assert pm.by_source["booking"].commission == Decimal("15")
        assert pm.by_source["booking"].bookings == 0
        assert sum(part.revenue for part in pm.by_source.values()) == pm.revenue

        await session.rollback()



def _deposit(booking_id: uuid.UUID, amount: str, status: str) -> BookingDepositModel:
    return BookingDepositModel(id=uuid.uuid4(), booking_id=booking_id, amount=Decimal(amount), status=status)


@pytestmark_integration
@pytest.mark.asyncio
async def test_payments_by_method_what_guests_owe_and_deposits_on_hand():
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest, stranger = _guest(company_id), _guest(uuid.uuid4())
        prop = _property(company_id, f"pay-{uuid.uuid4().hex[:8]}", "daily")
        other = _property(stranger.company_id, f"pay-{uuid.uuid4().hex[:8]}", "daily")
        # Paid 300 of 500 in cash and by card; a refund of 50 by card.
        owing = _booking(company_id, prop.id, guest.id, datetime(2025, 6, 1), datetime(2025, 6, 3), "500", "daily")
        card = _payment(owing.id, "100")
        card.method = "card"
        card_back = _refund(owing.id, "50")
        card_back.method = "card"
        # Paid in full by transfer; a payment still pending does not count.
        settled = _booking(company_id, prop.id, guest.id, datetime(2025, 6, 5), datetime(2025, 6, 7), "400", "daily")
        transfer = _payment(settled.id, "400")
        transfer.method = "transfer"
        # A cancelled stay owes nothing; one outside the period is not in it.
        gone = _cancelled(
            _booking(company_id, prop.id, guest.id, datetime(2025, 6, 10), datetime(2025, 6, 12), "700", "daily")
        )
        later = _booking(company_id, prop.id, guest.id, datetime(2025, 8, 1), datetime(2025, 8, 3), "900", "daily")
        foreign = _booking(
            stranger.company_id, other.id, stranger.id, datetime(2025, 6, 1), datetime(2025, 6, 3), "900", "daily"
        )
        session.add_all([
            guest, stranger, prop, other, owing, settled, gone, later, foreign,
            _payment(owing.id, "200"), card, card_back, transfer, _pending(settled.id, "100"),
            _payment(foreign.id, "900"),
            # Deposits: on hand now (also for the later stay), returned, kept, a stranger's.
            _deposit(owing.id, "10000", "paid"), _deposit(later.id, "5000", "paid"),
            _deposit(settled.id, "10000", "returned"), _deposit(gone.id, "10000", "held"),
            _deposit(foreign.id, "7000", "paid"),
        ])
        await session.flush()

        repo = SqlAnalyticsRepository(session)
        summary = await repo.get_payments_summary(company_id, DATE_FROM, DATE_TO)

        assert summary.received_by_method == {"cash": Decimal("200"), "card": Decimal("50"), "transfer": Decimal("400")}
        assert (summary.owing_bookings, summary.owed) == (1, Decimal("250"))
        assert (summary.deposits_count, summary.deposits_on_hand) == (2, Decimal("15000"))

        # Another flat chosen: nothing of this one.
        empty = await repo.get_payments_summary(company_id, DATE_FROM, DATE_TO, property_ids=[uuid.uuid4()])
        assert (empty.received_by_method, empty.owed, empty.deposits_on_hand) == ({}, 0, 0)

        await session.rollback()


# --- Occupancy and the count of stays: what a period holds, not what touches it ---


@pytestmark_integration
@pytest.mark.asyncio
async def test_a_check_out_on_the_first_day_is_no_stay_of_the_period():
    """A night before the period, left at noon on its first day, is neither a stay nor half a night."""
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest = _guest(company_id)
        prop = _property(company_id, f"edge-{uuid.uuid4().hex[:8]}", "daily")
        before = _booking(
            company_id, prop.id, guest.id, datetime(2025, 6, 9, 14), datetime(2025, 6, 10, 12), "100", "daily"
        )
        inside = _booking(
            company_id, prop.id, guest.id, datetime(2025, 6, 12, 14), datetime(2025, 6, 14, 12), "200", "daily"
        )
        session.add_all([guest, prop, before, inside])
        await session.flush()

        repo = SqlAnalyticsRepository(session)
        [pm] = await repo.get_property_metrics(company_id, date(2025, 6, 10), date(2025, 6, 20))

        assert pm.total_bookings == 1
        assert pm.booked_nights == Decimal("2")
        assert pm.revenue == Decimal("200")
        assert pm.adr == Decimal("100")
        await session.rollback()


@pytestmark_integration
@pytest.mark.asyncio
async def test_a_night_booked_from_one_in_the_morning_is_one_night():
    """01:00 to noon the next day is sold as a night: one night of occupancy, not 35 hours of it."""
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest = _guest(company_id)
        prop = _property(company_id, f"late-{uuid.uuid4().hex[:8]}", "daily")
        stay = _booking(
            company_id, prop.id, guest.id, datetime(2025, 6, 11, 1), datetime(2025, 6, 12, 12), "100", "daily"
        )
        session.add_all([guest, prop, stay])
        await session.flush()

        repo = SqlAnalyticsRepository(session)
        [pm] = await repo.get_property_metrics(company_id, DATE_FROM, DATE_TO)

        assert pm.booked_nights == Decimal("1")
        assert pm.adr == Decimal("100")
        await session.rollback()


@pytestmark_integration
@pytest.mark.asyncio
async def test_a_source_filter_keeps_every_flat_in_the_occupancy():
    """Only Booking.com: a flat with no stay from it is still a flat whose nights were on offer."""
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest = _guest(company_id)
        a = _property(company_id, f"src-a-{uuid.uuid4().hex[:8]}", "daily")
        b = _property(company_id, f"src-b-{uuid.uuid4().hex[:8]}", "daily")
        from_booking = _booking(
            company_id, a.id, guest.id, datetime(2025, 6, 2, 14), datetime(2025, 6, 4, 12), "200", "daily"
        )
        from_booking.source = "booking"
        direct = _booking(
            company_id, b.id, guest.id, datetime(2025, 6, 5, 14), datetime(2025, 6, 7, 12), "300", "daily"
        )
        session.add_all([guest, a, b, from_booking, direct])
        await session.flush()

        repo = SqlAnalyticsRepository(session)
        metrics = await repo.get_property_metrics(
            company_id, date(2025, 6, 1), date(2025, 6, 11), source=["booking"]
        )
        by_id = {pm.property_id: pm for pm in metrics}

        assert set(by_id) == {a.id, b.id}
        assert by_id[a.id].booked_nights == Decimal("2")
        assert by_id[b.id].booked_nights == Decimal("0")
        assert by_id[b.id].vacancy_days == Decimal("10")
        assert by_id[b.id].revenue == Decimal("0")

        # The chart takes the same two flats: on 2 June one of them is let from Booking.com.
        points = await repo.get_time_series(
            company_id, date(2025, 6, 1), date(2025, 6, 11), Granularity.DAY, source=["booking"]
        )
        by_day = {p.period_start: p for p in points}
        assert by_day[date(2025, 6, 2)].occupancy_rate == Decimal("50.00")
        assert by_day[date(2025, 6, 5)].occupancy_rate == Decimal("0.00")
        await session.rollback()


@pytestmark_integration
@pytest.mark.asyncio
async def test_a_flat_counts_from_the_day_it_came_in_or_its_first_stay():
    """A flat added mid-period has no empty nights before it: from its creation, or from a stay
    written in before it was created, whichever is earlier. The chart's days take the same flats."""
    company_id = uuid.uuid4()
    async with _fresh_session() as session:
        guest = _guest(company_id)
        old = _property(company_id, f"old-{uuid.uuid4().hex[:8]}", "daily")
        new = _property(company_id, f"new-{uuid.uuid4().hex[:8]}", "daily")
        new.created_at = datetime(2025, 6, 8, 9)
        later = _property(company_id, f"later-{uuid.uuid4().hex[:8]}", "daily")
        later.created_at = datetime(2025, 6, 9, 9)
        # Written in after the flat came in, for nights before it.
        early = _booking(
            company_id, later.id, guest.id, datetime(2025, 6, 6, 14), datetime(2025, 6, 7, 12), "100", "daily"
        )
        session.add_all([guest, old, new, later, early])
        await session.flush()

        repo = SqlAnalyticsRepository(session)
        period = (date(2025, 6, 1), date(2025, 6, 11))
        by_id = {pm.property_id: pm for pm in await repo.get_property_metrics(company_id, *period)}

        assert by_id[old.id].vacancy_days == Decimal("10")
        assert by_id[new.id].vacancy_days == Decimal("3")  # 8, 9 and 10 June
        assert by_id[later.id].booked_nights == Decimal("1")
        assert by_id[later.id].vacancy_days == Decimal("4")  # 6 June booked; 7–10 June free
        assert by_id[later.id].occupancy_rate == Decimal("20")

        points = await repo.get_time_series(company_id, *period, Granularity.DAY)
        by_day = {p.period_start: p for p in points}
        # 6 June: the old flat is empty, the late one is let, the new one is not there yet.
        assert by_day[date(2025, 6, 6)].occupancy_rate == Decimal("50.00")
        # 2 June: only the old flat existed, and it was empty.
        assert by_day[date(2025, 6, 2)].occupancy_rate == Decimal("0.00")
        await session.rollback()
