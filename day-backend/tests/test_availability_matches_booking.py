"""The search for free flats offers what booking accepts, no less.

The new-booking form lists only the flats the search offers. Two stays booking lets
in were hidden: the nights a guest freed by leaving early (a completed stay frees its
flat from today on), and a platform's own stay over that platform's closed nights
(the block is that very stay, read from its calendar).
"""

from datetime import date, datetime

import pytest

from app.application.booking.check_availability import CheckAvailabilityService
from app.domain.booking.entities import Booking, PropertyBlock
from app.domain.booking.value_objects import BookingStatus, RentalMode
from tests.test_booking_services import (
    COMPANY_ID,
    FakeBookingRepository,
    FakePropertyRepository,
    _build_price_calculator,
    _make_property,
)

NOW = datetime(2030, 10, 21, 12)


async def _search(unit, check_in, check_out, *, bookings=(), blocks=(), **kw):
    properties = FakePropertyRepository()
    properties._properties[unit.id] = unit
    repo = FakeBookingRepository()
    for booking in bookings:
        await repo.create(booking)
    for block in blocks:
        await repo.add_block(block)
    svc = CheckAvailabilityService(properties, repo, _build_price_calculator(), now=lambda: NOW)
    found = await svc.execute(COMPANY_ID, check_in, check_out, rental_mode=RentalMode.DAILY, with_prices=False, **kw)
    return [item.property.id for item in found]


@pytest.mark.asyncio
async def test_nights_freed_by_an_early_departure_are_offered_again():
    unit = _make_property()
    # Due out on the 25th, left on the 20th: completed, the planned dates kept.
    left_early = Booking(company_id=COMPANY_ID, property_id=unit.id, status=BookingStatus.COMPLETED,
                         check_in=datetime(2030, 10, 18, 14), check_out=datetime(2030, 10, 25, 12))

    assert await _search(unit, date(2030, 10, 22), date(2030, 10, 24), bookings=[left_early]) == [unit.id]
    # Before today the stay keeps its nights.
    assert await _search(unit, date(2030, 10, 19), date(2030, 10, 20), bookings=[left_early]) == []


@pytest.mark.asyncio
async def test_a_stay_not_completed_still_holds_its_nights():
    unit = _make_property()
    staying = Booking(company_id=COMPANY_ID, property_id=unit.id, status=BookingStatus.CHECKED_OUT,
                      check_in=datetime(2030, 10, 18, 14), check_out=datetime(2030, 10, 25, 12))

    assert await _search(unit, date(2030, 10, 22), date(2030, 10, 24), bookings=[staying]) == []


@pytest.mark.asyncio
async def test_a_platforms_own_closed_nights_do_not_hide_the_flat_from_its_stay():
    unit = _make_property()
    airbnb = PropertyBlock(company_id=COMPANY_ID, property_id=unit.id, start_date=date(2030, 11, 1),
                           end_date=date(2030, 11, 4), starts_at=datetime(2030, 11, 1, 12),
                           ends_at=datetime(2030, 11, 4, 12), source="airbnb", reserved=True)

    assert await _search(unit, date(2030, 11, 1), date(2030, 11, 4), blocks=[airbnb], source="airbnb") == [unit.id]
    # Any other stay, or one of unknown source, is still kept off those nights.
    assert await _search(unit, date(2030, 11, 1), date(2030, 11, 4), blocks=[airbnb], source="booking") == []
    assert await _search(unit, date(2030, 11, 1), date(2030, 11, 4), blocks=[airbnb]) == []
