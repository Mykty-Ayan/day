"""Hourly tariffs: a flat sells 3 hours, 6 hours and a night at fixed prices.

A stay out by 23:00 is priced by the smallest tariff that covers it (3 h, 6 h,
then whole days); a stay out later is the night, or whole days when it is too long
or ends too late. Friday and Saturday at the weekend price. Prices are Munar's
grid for a one-room flat. November 2026 starts on a Sunday.
"""

import uuid
from datetime import datetime, time
from decimal import Decimal

import pytest

from app.domain.auth.permissions import Permission
from app.domain.booking.value_objects import RentalMode
from app.domain.property.entities import PricingConfig
from tests.test_booking_services import FakePricingConfigRepository, _build_price_calculator
from tests.test_property_facts import flat  # noqa: F401  (a fixture)

MON, FRI, SAT = 2, 6, 7


async def _munar(**overrides) -> tuple:
    pricing_repo = FakePricingConfigRepository()
    prop_id = uuid.uuid4()
    fields = dict(
        property_id=prop_id,
        base_price=Decimal("20000"),
        weekend_markup=Decimal("4000"),
        hourly_price=Decimal("3000"),
        price_3h=Decimal("8000"),
        price_3h_weekend=Decimal("10000"),
        price_6h=Decimal("12000"),
        price_6h_weekend=Decimal("14000"),
        price_night=Decimal("15000"),
    )
    fields.update(overrides)
    await pricing_repo.save(PricingConfig(**fields))
    return _build_price_calculator(pricing_repo=pricing_repo), prop_id


async def _price(calc, prop_id, start: datetime, end: datetime):
    return await calc.calculate(prop_id, start, end, 2, 0, RentalMode.HOURLY)


@pytest.mark.asyncio
async def test_three_hours_on_a_weekday():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, MON, 14), datetime(2026, 11, MON, 17))
    assert (result.tariff, result.total, result.units, result.tariff_reason) == ("3h", Decimal("8000"), 3, None)


@pytest.mark.asyncio
async def test_three_hours_on_friday_at_the_weekend_price():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, FRI, 14), datetime(2026, 11, FRI, 17))
    assert (result.tariff, result.total) == ("3h", Decimal("10000"))


@pytest.mark.asyncio
async def test_two_hours_sell_as_three():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, MON, 14), datetime(2026, 11, MON, 16))
    assert (result.tariff, result.total, result.tariff_reason) == ("3h", Decimal("8000"), "rounded_up")


@pytest.mark.asyncio
async def test_four_hours_sell_as_six():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, MON, 14), datetime(2026, 11, MON, 18))
    assert (result.tariff, result.total) == ("6h", Decimal("12000"))


@pytest.mark.asyncio
async def test_six_hours_on_saturday():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, SAT, 12), datetime(2026, 11, SAT, 18))
    assert (result.tariff, result.total) == ("6h", Decimal("14000"))


@pytest.mark.asyncio
async def test_the_night_inside_its_window():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, MON, 23), datetime(2026, 11, MON + 1, 10))
    assert (result.tariff, result.total) == ("night", Decimal("15000"))


@pytest.mark.asyncio
async def test_a_weekend_night_without_its_own_price_costs_the_weekday_one():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, SAT, 22), datetime(2026, 11, SAT + 1, 10))
    assert (result.tariff, result.total) == ("night", Decimal("15000"))


@pytest.mark.asyncio
async def test_a_weekend_night_with_its_own_price():
    calc, prop_id = await _munar(price_night_weekend=Decimal("18000"))
    result = await _price(calc, prop_id, datetime(2026, 11, FRI, 22), datetime(2026, 11, SAT, 10))
    assert (result.tariff, result.total) == ("night", Decimal("18000"))


@pytest.mark.asyncio
async def test_after_midnight_is_still_the_night_before():
    # Check-in at 01:00 Saturday belongs to Friday's night: the weekend price.
    calc, prop_id = await _munar(price_night_weekend=Decimal("18000"))
    result = await _price(calc, prop_id, datetime(2026, 11, SAT, 1), datetime(2026, 11, SAT, 10))
    assert (result.tariff, result.total) == ("night", Decimal("18000"))


@pytest.mark.asyncio
async def test_six_hours_out_at_eleven_are_still_hours():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, MON, 17), datetime(2026, 11, MON, 23))
    assert (result.tariff, result.total) == ("6h", Decimal("12000"))


@pytest.mark.asyncio
async def test_out_after_eleven_is_the_night_whenever_the_guest_came():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, MON, 19), datetime(2026, 11, MON + 1, 0))
    assert (result.tariff, result.total) == ("night", Decimal("15000"))


@pytest.mark.asyncio
async def test_late_hours_are_not_sold_by_the_hour():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, MON, 22), datetime(2026, 11, MON + 1, 1))
    assert (result.tariff, result.total, result.tariff_reason) == ("night", Decimal("15000"), "late")


@pytest.mark.asyncio
async def test_a_night_longer_than_twelve_hours_sells_the_day():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, MON, 15), datetime(2026, 11, MON + 1, 10))
    assert (result.tariff, result.total) == ("day", Decimal("20000"))


@pytest.mark.asyncio
async def test_out_after_the_morning_sells_the_day():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, MON, 23), datetime(2026, 11, MON + 1, 11))
    assert (result.tariff, result.total, result.tariff_reason) == ("day", Decimal("20000"), "late")


@pytest.mark.asyncio
async def test_the_late_hour_and_the_night_are_the_flats_own():
    calc, prop_id = await _munar(late_from=time(22), night_max_hours=14)
    hours = await _price(calc, prop_id, datetime(2026, 11, MON, 19), datetime(2026, 11, MON, 22, 30))
    night = await _price(calc, prop_id, datetime(2026, 11, MON, 20), datetime(2026, 11, MON + 1, 10))
    assert (hours.tariff, night.tariff) == ("night", "night")


@pytest.mark.asyncio
async def test_eight_hours_in_daytime_sell_the_day():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, MON, 10), datetime(2026, 11, MON, 18))
    assert (result.tariff, result.total, result.units, result.tariff_reason) == ("day", Decimal("20000"), 8, "longer")


@pytest.mark.asyncio
async def test_the_day_on_friday_carries_the_weekend_markup():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, FRI, 10), datetime(2026, 11, FRI, 18))
    assert (result.tariff, result.total) == ("day", Decimal("24000"))


@pytest.mark.asyncio
async def test_a_switched_off_tariff_is_skipped():
    calc, prop_id = await _munar(price_6h=Decimal("0"), price_6h_weekend=Decimal("0"), price_night=Decimal("0"))
    four = await _price(calc, prop_id, datetime(2026, 11, MON, 14), datetime(2026, 11, MON, 18))
    night = await _price(calc, prop_id, datetime(2026, 11, MON, 22), datetime(2026, 11, MON + 1, 10))
    assert (four.tariff, four.total) == ("day", Decimal("20000"))
    assert (night.tariff, night.total) == ("day", Decimal("20000"))


@pytest.mark.asyncio
async def test_a_day_and_two_hours_sell_two_days():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, MON, 10), datetime(2026, 11, MON + 1, 12))
    assert (result.tariff, result.nights, result.total, result.tariff_reason) == ("day", 2, Decimal("40000"), "longer")


@pytest.mark.asyncio
async def test_three_days_from_thursday_take_friday_at_the_weekend_price():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, 5, 14), datetime(2026, 11, 8, 12))
    assert (result.tariff, result.nights, result.total) == ("day", 3, Decimal("68000"))  # 20 000 + 24 000 + 24 000


@pytest.mark.asyncio
async def test_the_day_after_midnight_is_priced_as_the_evening_before():
    # In at 02:00 belongs to the evening before, for the day's price too.
    calc, prop_id = await _munar()
    sunday = await _price(calc, prop_id, datetime(2026, 11, 8, 2), datetime(2026, 11, 8, 14))
    friday = await _price(calc, prop_id, datetime(2026, 11, FRI, 2), datetime(2026, 11, FRI, 14))
    assert (sunday.tariff, sunday.total) == ("day", Decimal("24000"))  # Saturday's night
    assert (friday.tariff, friday.total) == ("day", Decimal("20000"))  # Thursday's night


@pytest.mark.asyncio
async def test_six_in_the_morning_is_the_new_day():
    calc, prop_id = await _munar()
    result = await _price(calc, prop_id, datetime(2026, 11, MON, 6), datetime(2026, 11, MON, 9))
    assert (result.tariff, result.total) == ("3h", Decimal("8000"))


@pytest.mark.asyncio
async def test_a_flat_selling_only_the_night_sells_daytime_by_the_hour():
    calc, prop_id = await _munar(base_price=Decimal("0"), price_3h=Decimal("0"), price_3h_weekend=Decimal("0"),
                                 price_6h=Decimal("0"), price_6h_weekend=Decimal("0"))
    day = await _price(calc, prop_id, datetime(2026, 11, MON, 14), datetime(2026, 11, MON, 16))
    night = await _price(calc, prop_id, datetime(2026, 11, MON, 23), datetime(2026, 11, MON + 1, 9))
    assert (day.tariff, day.total) == (None, Decimal("6000"))  # 2 h × 3 000
    assert (night.tariff, night.total) == ("night", Decimal("15000"))


@pytest.mark.asyncio
async def test_no_tariff_covers_without_a_day_price():
    calc, prop_id = await _munar(base_price=Decimal("0"))
    with pytest.raises(ValueError, match="3h, 6h, night"):
        await _price(calc, prop_id, datetime(2026, 11, MON, 10), datetime(2026, 11, MON, 18))


@pytest.mark.asyncio
async def test_without_tariffs_hours_cost_the_hourly_price():
    calc, prop_id = await _munar(
        price_3h=Decimal("0"), price_3h_weekend=Decimal("0"), price_6h=Decimal("0"),
        price_6h_weekend=Decimal("0"), price_night=Decimal("0"),
    )
    result = await _price(calc, prop_id, datetime(2026, 11, MON, 14), datetime(2026, 11, MON, 18))
    assert (result.tariff, result.total) == (None, Decimal("12000"))


# ---------- Saving and the API ----------


def test_the_night_window_must_cross_midnight():
    from pydantic import ValidationError

    from app.presentation.schemas.property import PricingConfigCreate

    assert PricingConfigCreate(base_price=Decimal("1"), late_from=time(23), night_to=time(9)).night_to == time(9)
    with pytest.raises(ValidationError):
        PricingConfigCreate(base_price=Decimal("1"), late_from=time(1), night_to=time(10))
    with pytest.raises(ValidationError):
        PricingConfigCreate(base_price=Decimal("1"), night_max_hours=25)


async def test_a_save_without_tariffs_keeps_the_saved_ones():
    from app.application.property.manage_pricing import ManagePricingService, PricingConfigInput
    from tests.test_property_services import (
        COMPANY_ID,
        FakeDiscountRuleRepository,
        FakePropertyRepository,
        FakeSeasonalPriceRepository,
        _make_property,
    )

    props, pricing = FakePropertyRepository(), FakePricingConfigRepository()
    prop = _make_property()
    await props.save(prop)
    svc = ManagePricingService(props, pricing, FakeSeasonalPriceRepository(), FakeDiscountRuleRepository())
    await svc.upsert_pricing(prop.id, COMPANY_ID, PricingConfigInput(
        base_price=Decimal("20000"), price_3h=Decimal("8000"), late_from=time(22)))

    # An older form knows nothing of tariffs and sends only the base price.
    kept = await svc.upsert_pricing(prop.id, COMPANY_ID, PricingConfigInput(base_price=Decimal("21000")))

    assert (kept.base_price, kept.price_3h, kept.late_from) == (Decimal("21000"), Decimal("8000"), time(22))


async def test_one_time_alone_is_checked_against_the_saved_other():
    from app.application.property.manage_pricing import ManagePricingService, PricingConfigInput
    from tests.test_property_services import (
        COMPANY_ID,
        FakeDiscountRuleRepository,
        FakePropertyRepository,
        FakeSeasonalPriceRepository,
        _make_property,
    )

    props, pricing = FakePropertyRepository(), FakePricingConfigRepository()
    prop = _make_property()
    await props.save(prop)
    svc = ManagePricingService(props, pricing, FakeSeasonalPriceRepository(), FakeDiscountRuleRepository())
    await svc.upsert_pricing(prop.id, COMPANY_ID, PricingConfigInput(base_price=Decimal("20000")))

    # The saved morning is 10:00: a late hour of 09:00 would end the night before it began.
    with pytest.raises(ValueError, match="night_to before late_from"):
        await svc.upsert_pricing(prop.id, COMPANY_ID, PricingConfigInput(base_price=Decimal("20000"),
                                                                          late_from=time(9)))


async def test_a_clone_keeps_the_tariffs():
    from app.application.property.clone_property import ClonePropertyService
    from tests.test_property_services import (
        COMPANY_ID,
        FakeAmenityRepository,
        FakeDiscountRuleRepository,
        FakePropertyAuditLogRepository,
        FakePropertyPhotoRepository,
        FakePropertyRepository,
        FakeSeasonalPriceRepository,
        _make_property,
    )

    props, pricing = FakePropertyRepository(), FakePricingConfigRepository()
    source = _make_property()
    await props.save(source)
    await pricing.save(PricingConfig(property_id=source.id, price_night=Decimal("15000"), night_to=time(11)))
    svc = ClonePropertyService(props, FakePropertyPhotoRepository(), FakeAmenityRepository(), pricing,
                               FakeSeasonalPriceRepository(), FakeDiscountRuleRepository(),
                               FakePropertyAuditLogRepository())

    clone = await pricing.get_by_property((await svc.execute(source.id, COMPANY_ID)).id)

    assert (clone.price_night, clone.night_to) == (Decimal("15000"), time(11))


async def test_tariffs_copy_to_the_other_flats_of_the_company_only():
    from app.application.property.manage_pricing import ManagePricingService
    from tests.test_property_services import (
        COMPANY_ID,
        FakeDiscountRuleRepository,
        FakePropertyRepository,
        FakeSeasonalPriceRepository,
        _make_property,
    )

    props, pricing = FakePropertyRepository(), FakePricingConfigRepository()
    one, two, unpriced, foreign = _make_property(), _make_property(), _make_property(), _make_property()
    foreign.company_id = uuid.uuid4()
    for prop in (one, two, unpriced, foreign):
        await props.save(prop)
    await pricing.save(PricingConfig(property_id=one.id, base_price=Decimal("20000"), price_3h=Decimal("8000"),
                                     late_from=time(22)))
    await pricing.save(PricingConfig(property_id=two.id, base_price=Decimal("23000"), price_night=Decimal("17000")))
    await pricing.save(PricingConfig(property_id=foreign.id, base_price=Decimal("1")))
    svc = ManagePricingService(props, pricing, FakeSeasonalPriceRepository(), FakeDiscountRuleRepository())

    assert await svc.copy_tariffs_to_all(one.id, COMPANY_ID) == 1

    copied = await pricing.get_by_property(two.id)
    assert (copied.base_price, copied.price_3h, copied.price_night, copied.late_from) == (
        Decimal("23000"), Decimal("8000"), Decimal("0"), time(22))
    assert (await pricing.get_by_property(foreign.id)).price_3h == 0
    assert await pricing.get_by_property(unpriced.id) is None


@pytest.mark.integration
async def test_tariffs_are_saved_and_price_an_hourly_stay(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE, Permission.BOOKINGS_READ)
    saved = await client.put(f"/api/v1/properties/{prop}/pricing", json={
        "base_price": 20000, "weekend_markup": 4000, "hourly_price": 3000,
        "price_3h": 8000, "price_3h_weekend": 10000, "price_6h": 12000, "price_6h_weekend": 14000,
        "price_night": 15000, "late_from": "23:00", "night_to": "10:00", "night_max_hours": 12,
    })
    assert saved.status_code == 200, saved.text
    assert (saved.json()["price_6h_weekend"], saved.json()["late_from"]) == (14000, "23:00:00")

    # The form of today sends no tariffs: they stay.
    again = await client.put(f"/api/v1/properties/{prop}/pricing", json={"base_price": 20000, "hourly_price": 3000})
    assert again.json()["price_3h"] == 8000

    async def quote(start: str, end: str) -> dict:
        r = await client.post("/api/v1/bookings/calculate-price", json={
            "property_id": str(prop), "check_in": start, "check_out": end,
            "adults_count": 2, "children_count": 0, "rental_mode": "hourly",
        })
        assert r.status_code == 200, r.text
        return r.json()

    assert (await quote("2026-11-06T14:00:00", "2026-11-06T18:00:00"))["total"] == 14000
    night = await quote("2026-11-02T19:00:00", "2026-11-03T00:00:00")
    assert (night["tariff"], night["total"], night["tariff_reason"]) == ("night", 15000, "late")
    assert night["tariff_check_out"].endswith("T10:00:00")

    # The CRM's search by the hour names the tariff and why: 22:00–01:00 is the night.
    use(Permission.PROPERTIES_WRITE, Permission.BOOKINGS_READ)
    assert (await client.patch(f"/api/v1/properties/{prop}", json={"rental_mode": "both"})).status_code == 200
    found = await client.get("/api/v1/bookings/availability", params={
        "check_in": "2026-11-02T22:00:00", "check_out": "2026-11-03T01:00:00", "rental_mode": "hourly"})
    assert found.status_code == 200, found.text
    item = next(i for i in found.json()["items"] if i["property_id"] == str(prop))
    assert (item["tariff"], item["tariff_reason"], item["total_price"]) == ("night", "late", 15000)
    assert item["tariff_check_out"].endswith("T10:00:00")


async def test_the_guest_page_shows_the_tariffs_instead_of_an_hourly_price():
    from datetime import date

    from app.presentation.schemas.public import PublicStayResponse
    from tests.test_public_stay import Stay

    s = Stay()
    prop = await s.flat(hourly_price=Decimal("3000"), price_3h=Decimal("8000"), price_3h_weekend=Decimal("10000"),
                        price_night=Decimal("15000"), price_night_weekend=Decimal("15000"))
    prop.rental_mode = RentalMode.BOTH
    await s.props.save(prop)

    prices = PublicStayResponse.from_stay(
        await s.service().execute(prop.public_code, date(2030, 10, 1), date(2030, 10, 3))).prices

    assert prices.hour is None
    assert [(t.name, t.price, t.weekend) for t in prices.tariffs] == [("3h", 8000, 10000), ("night", 15000, None)]
    assert (prices.late_from, prices.night_to) == ("23:00", "10:00")


async def test_what_was_sold_ends_at_the_tariff_not_at_the_hours_asked():
    calc, prop_id = await _munar()
    four = await _price(calc, prop_id, datetime(2026, 11, 3, 10), datetime(2026, 11, 3, 14))
    assert (four.tariff, four.tariff_check_out) == ("6h", datetime(2026, 11, 3, 16))
    # Never past the late hour, even with hours paid for.
    late = await _price(calc, prop_id, datetime(2026, 11, 3, 21), datetime(2026, 11, 3, 22))
    assert (late.tariff, late.tariff_check_out) == ("3h", datetime(2026, 11, 3, 23))
    night = await _price(calc, prop_id, datetime(2026, 11, 3, 22), datetime(2026, 11, 4, 7))
    assert (night.tariff, night.tariff_check_out) == ("night", datetime(2026, 11, 4, 10))
    days = await _price(calc, prop_id, datetime(2026, 11, 3, 10), datetime(2026, 11, 4, 16))
    assert (days.tariff, days.tariff_check_out) == ("day", None)
