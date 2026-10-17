"""A price for one night or several, set on the calendar as on Airbnb: it replaces
the flat's nightly price for those nights (base, season and weekend markup alike)
and a long-stay discount does not cut it. Bookings already made keep their price."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.application.property.day_prices import ManageDayPricesService
from app.domain.auth.permissions import Permission
from app.domain.booking.value_objects import RentalMode
from app.domain.property.entities import DiscountRule, PricingConfig, SeasonalPrice
from tests.test_booking_services import (
    COMPANY_ID,
    FakeDayPriceRepository,
    FakeDiscountRuleRepository,
    FakePricingConfigRepository,
    FakePropertyRepository,
    FakeSeasonalPriceRepository,
    _build_price_calculator,
    _make_property,
)
from tests.test_property_facts import flat  # noqa: F401  (a fixture)

# 30 Dec 2026 is a Wednesday, 31 Dec a Thursday, 1 Jan 2027 a Friday.
NEW_YEAR = date(2026, 12, 31)


class Prices:
    def __init__(self):
        self.props = FakePropertyRepository()
        self.pricing = FakePricingConfigRepository()
        self.seasonal = FakeSeasonalPriceRepository()
        self.discounts = FakeDiscountRuleRepository()
        self.days = FakeDayPriceRepository()
        self.calc = _build_price_calculator(self.pricing, self.seasonal, self.discounts, self.days)
        self.svc = ManageDayPricesService(self.props, self.days)

    async def flat(self, **pricing):
        prop = _make_property(company_id=COMPANY_ID)
        await self.props.save(prop)
        config = PricingConfig(property_id=prop.id, base_price=Decimal("10000"), **pricing)
        await self.pricing.save(config)
        return prop, config

    async def total(self, prop, check_in, check_out, mode=RentalMode.DAILY):
        return (await self.calc.calculate(prop.id, check_in, check_out, 2, 0, mode)).total

    async def nights(self, prop, date_from=date(2026, 12, 1), date_to=date(2027, 2, 1)):
        return {p.date: p.price for p in await self.svc.list(COMPANY_ID, prop.id, date_from, date_to)}


async def test_a_calendar_price_replaces_the_nights_price():
    p = Prices()
    prop, config = await p.flat(weekend_markup=Decimal("2000"))
    await p.seasonal.save(
        SeasonalPrice(pricing_config_id=config.id, name="Зима", start_date=date(2026, 12, 20),
                      end_date=date(2027, 1, 10), price_per_night=Decimal("12000"))
    )
    await p.svc.set(COMPANY_ID, prop.id, NEW_YEAR, date(2027, 1, 1), Decimal("25000"))
    # A Friday priced on the calendar takes no weekend markup.
    await p.svc.set(COMPANY_ID, prop.id, date(2027, 1, 1), date(2027, 1, 2), Decimal("15000"))
    # 30 Dec by the season, 31 Dec and 1 Jan by the calendar.
    assert await p.total(prop, date(2026, 12, 30), date(2027, 1, 2)) == Decimal("52000")


async def test_a_long_stay_discount_leaves_a_calendar_price_whole():
    p = Prices()
    prop, config = await p.flat()
    await p.discounts.save(DiscountRule(pricing_config_id=config.id, min_nights=3, discount_percent=Decimal("10")))
    await p.svc.set(COMPANY_ID, prop.id, NEW_YEAR, date(2027, 1, 1), Decimal("25000"))
    # 10 % off the two ordinary nights only: 45 000 − 2 000.
    assert await p.total(prop, date(2026, 12, 30), date(2027, 1, 2)) == Decimal("43000")


async def test_an_hourly_stay_keeps_the_hourly_price():
    p = Prices()
    prop, _ = await p.flat(hourly_price=Decimal("3000"))
    await p.svc.set(COMPANY_ID, prop.id, NEW_YEAR, date(2027, 1, 1), Decimal("25000"))
    total = await p.total(prop, datetime(2026, 12, 31, 10), datetime(2026, 12, 31, 12), RentalMode.HOURLY)
    assert total == Decimal("6000")


async def test_a_new_price_replaces_the_old_one_and_a_reset_brings_the_usual_back():
    p = Prices()
    prop, _ = await p.flat()
    await p.svc.set(COMPANY_ID, prop.id, date(2026, 12, 30), date(2027, 1, 2), Decimal("20000"))
    await p.svc.set(COMPANY_ID, prop.id, NEW_YEAR, date(2027, 1, 1), Decimal("25000"))
    assert await p.nights(prop) == {
        date(2026, 12, 30): Decimal("20000"),
        NEW_YEAR: Decimal("25000"),
        date(2027, 1, 1): Decimal("20000"),
    }
    await p.svc.clear(COMPANY_ID, prop.id, date(2026, 12, 30), date(2027, 1, 1))
    assert await p.nights(prop) == {date(2027, 1, 1): Decimal("20000")}
    assert await p.total(prop, date(2026, 12, 30), date(2026, 12, 31)) == Decimal("10000")


async def test_a_calendar_price_takes_a_night_a_positive_price_and_the_companys_own_flat():
    p = Prices()
    prop, _ = await p.flat()
    with pytest.raises(ValueError, match="end_date"):
        await p.svc.set(COMPANY_ID, prop.id, NEW_YEAR, NEW_YEAR, Decimal("25000"))
    with pytest.raises(ValueError, match="366"):
        await p.svc.set(COMPANY_ID, prop.id, date(2027, 1, 1), date(2028, 1, 3), Decimal("25000"))
    with pytest.raises(ValueError, match="price"):
        await p.svc.set(COMPANY_ID, prop.id, NEW_YEAR, date(2027, 1, 1), Decimal("0"))
    with pytest.raises(ValueError, match="Property not found"):
        await p.svc.set(uuid.uuid4(), prop.id, NEW_YEAR, date(2027, 1, 1), Decimal("25000"))
    with pytest.raises(ValueError, match="Property not found"):
        await p.svc.clear(uuid.uuid4(), prop.id, NEW_YEAR, date(2027, 1, 1))
    assert await p.nights(prop) == {}


async def test_the_chessboard_carries_each_flats_calendar_prices():
    from app.application.booking.get_gantt_data import GetGanttDataService
    from app.domain.property.entities import DayPrice
    from app.domain.property.value_objects import PropertyStatus

    prop = _make_property(company_id=COMPANY_ID, status=PropertyStatus.ACTIVE)
    property_repo, booking_repo, guest_repo, day_repo = AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    property_repo.list_by_company.return_value = [prop]
    booking_repo.list_by_property_date_range.return_value = []
    booking_repo.list_company_blocks.return_value = []
    day_repo.list_for_company.return_value = [
        DayPrice(company_id=COMPANY_ID, property_id=prop.id, date=NEW_YEAR, price=Decimal("25000"))
    ]
    result = await GetGanttDataService(property_repo, booking_repo, guest_repo, day_repo).execute(  # type: ignore[arg-type]
        COMPANY_ID, date(2026, 12, 1), date(2027, 1, 1)
    )
    day_repo.list_for_company.assert_awaited_once_with(COMPANY_ID, date(2026, 12, 1), date(2027, 1, 1))
    assert [(d.date, d.price) for d in result.properties[0].day_prices] == [(NEW_YEAR, Decimal("25000"))]


@pytest.mark.integration
async def test_calendar_prices_through_the_api(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}/day-prices"
    new_year = {"start_date": "2030-12-31", "end_date": "2031-01-01", "price": 50000}

    use(Permission.PROPERTIES_READ)
    assert (await client.put(path, json=new_year)).status_code == 403

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE, Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE)
    saved = await client.put(path, json=new_year)
    assert saved.status_code == 200, saved.text
    assert saved.json() == [{"date": "2030-12-31", "price": 50000.0}]
    assert (await client.put(path, json={**new_year, "price": 0})).status_code == 422

    window = {"date_from": "2030-12-01", "date_to": "2031-02-01"}
    assert (await client.get(path, params=window)).json() == [{"date": "2030-12-31", "price": 50000.0}]

    # A booking over it pays the calendar price for that night (the flat's base is 20 000).
    stay = {
        "property_id": str(prop),
        "guest_name": "Ерлан",
        "guest_phone": "+77010001231",
        "check_in": "2030-12-30T14:00:00",
        "check_out": "2031-01-01T12:00:00",
    }
    booked = await client.post("/api/v1/bookings", json=stay)
    assert booked.status_code == 201, booked.text
    assert booked.json()["total_price"] == 70000.0

    clear = await client.delete(path, params={"start_date": "2030-12-31", "end_date": "2031-01-01"})
    assert clear.status_code == 204
    assert (await client.get(path, params=window)).json() == []
    # Another company's flat: as if it did not exist.
    assert (await client.get(f"/api/v1/properties/{uuid.uuid4()}/day-prices", params=window)).status_code == 404
