"""The company's weekend nights: the owner ticks Friday, Saturday, Sunday; the weekend
markup and the weekend tariffs follow. Friday and Saturday were fixed in the code."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.application.booking.price_calculator import PriceCalculatorService
from app.application.settings.update_settings import UpdateSettingsService
from app.domain.booking.value_objects import RentalMode
from app.domain.property.entities import PricingConfig
from app.domain.settings.entities import CompanySettings
from app.presentation.schemas.settings import SettingsUpdate
from tests.test_booking_services import (
    COMPANY_ID,
    FakeDayPriceRepository,
    FakeDiscountRuleRepository,
    FakePricingConfigRepository,
    FakePropertyRepository,
    FakeSeasonalPriceRepository,
    _make_property,
)
from tests.test_company_time_zone import FakeSettingsRepository

# 2026-11-06 is a Friday, 07 a Saturday, 08 a Sunday.
FRI, SAT, SUN = date(2026, 11, 6), date(2026, 11, 7), date(2026, 11, 8)


async def _calc(weekend: tuple[int, ...] | None):
    props, pricing, settings = FakePropertyRepository(), FakePricingConfigRepository(), FakeSettingsRepository()
    prop = _make_property(rental_mode=RentalMode.BOTH)
    await props.save(prop)
    await pricing.save(
        PricingConfig(
            property_id=prop.id,
            base_price=Decimal("20000"),
            weekend_markup=Decimal("4000"),
            price_3h=Decimal("8000"),
            price_3h_weekend=Decimal("10000"),
        )
    )
    if weekend is not None:
        await settings.save(CompanySettings(company_id=COMPANY_ID, weekend_nights=weekend))
    calc = PriceCalculatorService(
        pricing, FakeSeasonalPriceRepository(), FakeDiscountRuleRepository(), FakeDayPriceRepository(), props, settings
    )
    return calc, prop.id


async def _night(calc, prop_id, night: date) -> Decimal:
    result = await calc.calculate(prop_id, night, date.fromordinal(night.toordinal() + 1), 1, 0)
    return result.weekend_surcharge


@pytest.mark.asyncio
async def test_without_settings_friday_and_saturday_as_before():
    calc, prop_id = await _calc(None)
    assert [await _night(calc, prop_id, d) for d in (FRI, SAT, SUN)] == [Decimal("4000"), Decimal("4000"), 0]


@pytest.mark.asyncio
async def test_saturday_and_sunday_when_the_company_says_so():
    calc, prop_id = await _calc((5, 6))
    assert [await _night(calc, prop_id, d) for d in (FRI, SAT, SUN)] == [0, Decimal("4000"), Decimal("4000")]


@pytest.mark.asyncio
async def test_no_weekend_at_all():
    calc, prop_id = await _calc(())
    assert [await _night(calc, prop_id, d) for d in (FRI, SAT, SUN)] == [0, 0, 0]


@pytest.mark.asyncio
async def test_the_weekend_tariff_follows_the_company_days():
    calc, prop_id = await _calc((6,))
    hourly = RentalMode.HOURLY
    sunday = await calc.calculate(prop_id, datetime(2026, 11, 8, 14), datetime(2026, 11, 8, 17), 1, 0, hourly)
    friday = await calc.calculate(prop_id, datetime(2026, 11, 6, 14), datetime(2026, 11, 6, 17), 1, 0, hourly)
    assert (sunday.total, friday.total) == (Decimal("10000"), Decimal("8000"))


def test_only_friday_saturday_and_sunday_can_be_weekend_nights():
    assert SettingsUpdate(weekend_nights=[6, 4, 4]).weekend_nights == [4, 6]
    assert SettingsUpdate(weekend_nights=[]).weekend_nights == []
    with pytest.raises(ValidationError):
        SettingsUpdate(weekend_nights=[3])


@pytest.mark.asyncio
async def test_the_setting_is_saved():
    repo = FakeSettingsRepository()
    company = uuid.uuid4()
    saved = await UpdateSettingsService(repo).execute(company, weekend_nights=[5, 6])
    assert saved.weekend_nights == (5, 6)
    again = await UpdateSettingsService(repo).execute(company, minibar_invoice=True)
    assert again.weekend_nights == (5, 6)
