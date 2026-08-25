"""Phase 2 tests: hourly branch of PriceCalculatorService.

The hourly branch is deliberately simple: ``ceil(hours) * hourly_price`` with no
weekend / seasonal / discount / extra-guest modifiers. Daily behaviour must stay
byte-for-byte identical to the pre-hourly baseline.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest

from app.domain.booking.value_objects import RentalMode
from app.domain.property.entities import PricingConfig
from tests.test_booking_services import (
    FakePricingConfigRepository,
    _build_price_calculator,
)


async def _hourly_calculator(hourly_price: Decimal) -> tuple:
    pricing_repo = FakePricingConfigRepository()
    prop_id = uuid.uuid4()
    await pricing_repo.save(
        PricingConfig(
            property_id=prop_id,
            base_price=Decimal("100"),
            hourly_price=hourly_price,
        )
    )
    return _build_price_calculator(pricing_repo=pricing_repo), prop_id


# ---------- Hourly branch ----------


@pytest.mark.asyncio
async def test_hourly_exact_three_hours():
    calc, prop_id = await _hourly_calculator(Decimal("40"))

    result = await calc.calculate(
        prop_id,
        datetime(2025, 6, 2, 10, 0),
        datetime(2025, 6, 2, 13, 0),
        1,
        0,
        RentalMode.HOURLY,
    )

    assert result.unit_label == "hours"
    assert result.units == 3
    assert result.nights == 0
    assert result.base_total == Decimal("120")  # 40 * 3
    assert result.total == Decimal("120")
    assert result.weekend_surcharge == Decimal("0")
    assert result.seasonal_adjustment == Decimal("0")
    assert result.extra_guest_surcharge == Decimal("0")
    assert result.discount_amount == Decimal("0")


@pytest.mark.asyncio
async def test_hourly_partial_hours_ceils_up():
    calc, prop_id = await _hourly_calculator(Decimal("40"))

    # 2.5 hours -> ceil to 3
    result = await calc.calculate(
        prop_id,
        datetime(2025, 6, 2, 10, 0),
        datetime(2025, 6, 2, 12, 30),
        1,
        0,
        RentalMode.HOURLY,
    )

    assert result.units == 3
    assert result.total == Decimal("120")  # 40 * 3


@pytest.mark.asyncio
async def test_hourly_ignores_extra_guests():
    """Hourly stays SIMPLE: extra adults/children never surcharge."""
    calc, prop_id = await _hourly_calculator(Decimal("40"))

    result = await calc.calculate(
        prop_id,
        datetime(2025, 6, 2, 10, 0),
        datetime(2025, 6, 2, 14, 0),
        5,
        3,
        RentalMode.HOURLY,
    )

    assert result.units == 4
    assert result.extra_guest_surcharge == Decimal("0")
    assert result.total == Decimal("160")  # 40 * 4


@pytest.mark.asyncio
async def test_hourly_zero_duration_raises():
    calc, prop_id = await _hourly_calculator(Decimal("40"))

    with pytest.raises(ValueError, match="Check-out must be after check-in"):
        await calc.calculate(
            prop_id,
            datetime(2025, 6, 2, 10, 0),
            datetime(2025, 6, 2, 10, 0),
            1,
            0,
            RentalMode.HOURLY,
        )


# ---------- Daily regression guards ----------


@pytest.mark.asyncio
async def test_daily_same_day_still_rejected():
    """Same-day booking in DAILY mode still fails (0 nights)."""
    calc, prop_id = await _hourly_calculator(Decimal("40"))

    with pytest.raises(ValueError, match="Check-out must be after check-in"):
        await calc.calculate(
            prop_id,
            datetime(2025, 6, 5, 14, 0),
            datetime(2025, 6, 5, 18, 0),
            1,
            0,
            RentalMode.DAILY,
        )


@pytest.mark.asyncio
async def test_daily_total_unchanged():
    """Daily totals are identical to the pre-hourly baseline."""
    pricing_repo = FakePricingConfigRepository()
    prop_id = uuid.uuid4()
    await pricing_repo.save(
        PricingConfig(
            property_id=prop_id,
            base_price=Decimal("100"),
            hourly_price=Decimal("40"),
        )
    )
    calc = _build_price_calculator(pricing_repo=pricing_repo)

    # Default rental_mode is DAILY; 3 nights Mon-Thu.
    result = await calc.calculate(prop_id, date(2025, 6, 2), date(2025, 6, 5), 1, 0)

    assert result.unit_label == "nights"
    assert result.nights == 3
    assert result.units == 3
    assert result.base_total == Decimal("300")
    assert result.total == Decimal("300")
