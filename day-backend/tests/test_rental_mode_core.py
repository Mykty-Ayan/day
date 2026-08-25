"""Phase 1 core tests: datetime booking columns + rental_mode + hourly_price.

These assert the daily-preserving behaviour of the hourly-rental foundation:
  * daily bookings created from a bare date get default 14:00 / 12:00 times;
  * daily nightly totals are byte-for-byte identical whether the caller passes a
    ``date`` or an equivalent ``datetime``;
  * ``rental_mode`` and ``hourly_price`` round-trip through the domain layer.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest

from app.application.booking.create_booking import (
    CreateBookingInput,
    CreateBookingService,
    apply_default_times,
)
from app.domain.booking.entities import Booking
from app.domain.booking.value_objects import RentalMode
from app.domain.property.entities import PricingConfig, Property
from app.domain.property.value_objects import PropertyStatus, PropertyType
from tests.test_booking_services import (
    COMPANY_ID,
    FakeBookingAuditLogRepository,
    FakeBookingRepository,
    FakeGuestRepository,
    FakePricingConfigRepository,
    FakePropertyRepository,
    _build_price_calculator,
)


def _make_active_property(rental_mode: RentalMode = RentalMode.DAILY) -> Property:
    return Property(
        id=uuid.uuid4(),
        company_id=COMPANY_ID,
        name="Test Prop",
        internal_name="test-prop",
        status=PropertyStatus.ACTIVE,
        type=PropertyType.APARTMENT,
        rental_mode=rental_mode,
    )


async def _build_create_service(pricing_repo=None):
    prop_repo = FakePropertyRepository()
    booking_repo = FakeBookingRepository()
    guest_repo = FakeGuestRepository()
    audit_repo = FakeBookingAuditLogRepository()
    pricing_repo = pricing_repo or FakePricingConfigRepository()

    prop = _make_active_property()
    await prop_repo.save(prop)
    await pricing_repo.save(PricingConfig(property_id=prop.id, base_price=Decimal("100")))

    price_calc = _build_price_calculator(pricing_repo=pricing_repo)
    svc = CreateBookingService(booking_repo, guest_repo, prop_repo, audit_repo, price_calc)
    return svc, prop


# ---------- RentalMode enum ----------


def test_rental_mode_values():
    assert RentalMode.DAILY.value == "daily"
    assert RentalMode.HOURLY.value == "hourly"
    assert RentalMode.BOTH.value == "both"
    assert RentalMode("daily") is RentalMode.DAILY


# ---------- Default-time coercion ----------


def test_apply_default_times_from_bare_date():
    ci, co = apply_default_times(date(2025, 6, 2), date(2025, 6, 5), RentalMode.DAILY)
    assert ci == datetime(2025, 6, 2, 14, 0)
    assert co == datetime(2025, 6, 5, 12, 0)


def test_apply_default_times_from_midnight_datetime():
    ci, co = apply_default_times(
        datetime(2025, 6, 2, 0, 0), datetime(2025, 6, 5, 0, 0), RentalMode.DAILY
    )
    assert ci == datetime(2025, 6, 2, 14, 0)
    assert co == datetime(2025, 6, 5, 12, 0)


def test_apply_default_times_preserves_explicit_times():
    ci, co = apply_default_times(
        datetime(2025, 6, 2, 9, 30), datetime(2025, 6, 2, 11, 30), RentalMode.DAILY
    )
    assert ci == datetime(2025, 6, 2, 9, 30)
    assert co == datetime(2025, 6, 2, 11, 30)


# ---------- Daily booking stores default times ----------


@pytest.mark.asyncio
async def test_daily_booking_defaults_times_from_date_input():
    svc, prop = await _build_create_service()

    result = await svc.execute(
        CreateBookingInput(
            company_id=COMPANY_ID,
            property_id=prop.id,
            guest_name="Guest",
            check_in=date(2025, 6, 2),
            check_out=date(2025, 6, 5),
        )
    )

    assert result.rental_mode == RentalMode.DAILY
    assert result.check_in == datetime(2025, 6, 2, 14, 0)
    assert result.check_out == datetime(2025, 6, 5, 12, 0)


# ---------- Daily totals unchanged with datetime input ----------


@pytest.mark.asyncio
async def test_daily_total_identical_for_date_and_datetime_inputs():
    pricing_repo = FakePricingConfigRepository()
    prop_id = uuid.uuid4()
    await pricing_repo.save(PricingConfig(property_id=prop_id, base_price=Decimal("100")))
    calc = _build_price_calculator(pricing_repo=pricing_repo)

    with_dates = await calc.calculate(prop_id, date(2025, 6, 2), date(2025, 6, 5), 1, 0)
    with_datetimes = await calc.calculate(
        prop_id,
        datetime(2025, 6, 2, 14, 0),
        datetime(2025, 6, 5, 12, 0),
        1,
        0,
    )

    assert with_dates.nights == with_datetimes.nights == 3
    assert with_dates.total == with_datetimes.total == Decimal("300")


# ---------- rental_mode round-trips through the domain ----------


@pytest.mark.asyncio
async def test_rental_mode_round_trips_through_booking_repo():
    repo = FakeBookingRepository()
    booking = Booking(
        id=uuid.uuid4(),
        company_id=COMPANY_ID,
        property_id=uuid.uuid4(),
        guest_id=uuid.uuid4(),
        check_in=datetime(2025, 6, 2, 10, 0),
        check_out=datetime(2025, 6, 2, 13, 0),
        rental_mode=RentalMode.HOURLY,
    )
    await repo.create(booking)

    fetched = await repo.get_by_id(booking.id)
    assert fetched is not None
    assert fetched.rental_mode == RentalMode.HOURLY


def test_property_defaults_to_daily_rental_mode():
    prop = _make_active_property()
    assert prop.rental_mode == RentalMode.DAILY
    both = _make_active_property(rental_mode=RentalMode.BOTH)
    assert both.rental_mode == RentalMode.BOTH


# ---------- hourly_price round-trips through pricing repo ----------


@pytest.mark.asyncio
async def test_hourly_price_round_trips_through_pricing_repo():
    repo = FakePricingConfigRepository()
    prop_id = uuid.uuid4()
    await repo.save(
        PricingConfig(
            property_id=prop_id,
            base_price=Decimal("100"),
            hourly_price=Decimal("25.50"),
        )
    )

    fetched = await repo.get_by_property(prop_id)
    assert fetched is not None
    assert fetched.base_price == Decimal("100")
    assert fetched.hourly_price == Decimal("25.50")


def test_pricing_config_hourly_price_defaults_to_zero():
    config = PricingConfig(property_id=uuid.uuid4(), base_price=Decimal("100"))
    assert config.hourly_price == Decimal("0")
