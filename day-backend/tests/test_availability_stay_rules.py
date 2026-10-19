"""The search for free flats keeps to their stay rules, as booking does.

A unit the search offered could then be refused at booking (422 stay_rules):
the CRM and the guest bot named a slot Day would not sell. The search now
leaves out a unit whose rules the stay breaks; an operator's search (the Mini
App, the assistant) still sees it, with the rules it breaks, and may book it
by confirming.
"""

from datetime import date, datetime

import pytest

from app.application.booking.check_availability import CheckAvailabilityService
from app.domain.booking.entities import Booking
from app.domain.booking.stay_rules import RuleBreach
from app.domain.booking.value_objects import BookingStatus, RentalMode
from tests.test_booking_services import (
    COMPANY_ID,
    FakeBookingRepository,
    FakePropertyRepository,
    _build_price_calculator,
    _make_property,
)
from tests.test_property_facts import flat  # noqa: F401  (a fixture)


async def _search(unit, check_in, check_out, *, bookings=(), mode=RentalMode.HOURLY, now=None, **kw):
    properties = FakePropertyRepository()
    properties._properties[unit.id] = unit
    repo = FakeBookingRepository()
    for booking in bookings:
        await repo.create(booking)
    svc = CheckAvailabilityService(properties, repo, _build_price_calculator(), now=lambda: now)
    return await svc.execute(COMPANY_ID, check_in, check_out, rental_mode=mode, with_prices=False, **kw)


def _hourly_flat(**rules):
    unit = _make_property()
    unit.rental_mode = RentalMode.BOTH
    for name, value in rules.items():
        setattr(unit, name, value)
    return unit


@pytest.mark.asyncio
async def test_a_slot_inside_the_cleaning_buffer_is_not_offered():
    unit = _hourly_flat(buffer_minutes=30)
    before = Booking(company_id=COMPANY_ID, property_id=unit.id, status=BookingStatus.CONFIRMED,
                     rental_mode=RentalMode.HOURLY,
                     check_in=datetime(2030, 10, 20, 10), check_out=datetime(2030, 10, 20, 12))

    too_soon = await _search(unit, datetime(2030, 10, 20, 12, 15), datetime(2030, 10, 20, 14), bookings=[before])
    after_cleaning = await _search(unit, datetime(2030, 10, 20, 12, 30), datetime(2030, 10, 20, 14), bookings=[before])

    assert too_soon == []
    assert [item.property.id for item in after_cleaning] == [unit.id]


@pytest.mark.asyncio
async def test_a_stay_too_close_to_now_is_not_offered():
    unit = _hourly_flat(min_lead_hours=3)
    now = datetime(2030, 10, 20, 12)

    assert await _search(unit, datetime(2030, 10, 20, 14), datetime(2030, 10, 20, 16), now=now) == []
    assert len(await _search(unit, datetime(2030, 10, 20, 15), datetime(2030, 10, 20, 17), now=now)) == 1


@pytest.mark.asyncio
async def test_an_operator_still_sees_the_flat_with_the_rules_it_breaks():
    unit = _hourly_flat()
    unit.min_nights = 2

    found = await _search(unit, date(2030, 11, 1), date(2030, 11, 2), mode=RentalMode.DAILY,
                          with_rule_breaches=True)

    assert [item.rule_breaches for item in found] == [[RuleBreach("min_nights", 2, 1)]]
    assert await _search(unit, date(2030, 11, 1), date(2030, 11, 2), mode=RentalMode.DAILY) == []


@pytest.mark.integration
async def test_the_api_leaves_out_a_breaking_flat_unless_asked(flat):  # noqa: F811  (the imported fixture)
    from app.domain.auth.permissions import Permission

    client, prop, use = flat
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE, Permission.BOOKINGS_READ)
    assert (await client.patch(f"/api/v1/properties/{prop}", json={"min_nights": 2})).status_code == 200
    one_night = {"check_in": "2030-11-01T00:00:00", "check_out": "2030-11-02T00:00:00"}

    plain = (await client.get("/api/v1/bookings/availability", params=one_night)).json()
    asked_for = {**one_night, "include_rule_breaches": True}
    asked = (await client.get("/api/v1/bookings/availability", params=asked_for)).json()

    assert plain["items"] == []
    assert [(i["property_id"], i["rule_breaches"]) for i in asked["items"]] == [
        (str(prop), [{"rule": "min_nights", "limit": 2, "actual": 1}])
    ]


@pytest.mark.asyncio
async def test_the_buffer_reaches_a_booking_after_midnight():
    # A stay to 23:00 and a guest at 00:30: two hours to clean are not there.
    unit = _hourly_flat(buffer_minutes=120)
    night = Booking(company_id=COMPANY_ID, property_id=unit.id, status=BookingStatus.CONFIRMED,
                    rental_mode=RentalMode.HOURLY,
                    check_in=datetime(2030, 10, 21, 0, 30), check_out=datetime(2030, 10, 21, 3))

    assert await _search(unit, datetime(2030, 10, 20, 20), datetime(2030, 10, 20, 23), bookings=[night]) == []
