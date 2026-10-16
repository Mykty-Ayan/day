"""Closing a flat's nights without a booking (repairs, the owner's own guests, a
stay sold elsewhere). A block covers whole nights: from the check-out hour of its
first day to the check-out hour of its last one. Nothing is booked over it."""

import uuid
from datetime import date, datetime

import pytest

from app.application.booking.check_availability import CheckAvailabilityService
from app.application.booking.manage_blocks import ManageBlocksService
from app.application.booking.update_booking import UpdateBookingInput
from app.domain.auth.permissions import Permission
from app.domain.booking.exceptions import BlockOverlapsBookingError, PropertyBlockedError
from app.domain.booking.value_objects import RentalMode
from tests.test_booking_services import COMPANY_ID, _build_price_calculator
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_stay_rules_bookings import Flats


async def _blocked(f: Flats, prop, start: date, end: date):
    return await ManageBlocksService(f.bookings, f.props).create(COMPANY_ID, prop.id, start, end, reason="Ремонт")


async def test_no_stay_is_booked_over_a_block():
    f = Flats()
    prop = await f.flat()
    await _blocked(f, prop, date(2030, 3, 10), date(2030, 3, 12))
    with pytest.raises(PropertyBlockedError):
        await f.book(prop, datetime(2030, 3, 11, 14), datetime(2030, 3, 13, 12))
    with pytest.raises(PropertyBlockedError):
        await f.book(prop, datetime(2030, 3, 10, 13), datetime(2030, 3, 10, 15), RentalMode.HOURLY)


async def test_a_block_leaves_the_mornings_around_it():
    # The guest before leaves at noon of the first day; the next arrives on the last day.
    f = Flats()
    prop, hourly = await f.flat(), await f.flat()
    await _blocked(f, prop, date(2030, 3, 10), date(2030, 3, 12))
    await f.book(prop, datetime(2030, 3, 9, 14), datetime(2030, 3, 10, 12))
    await f.book(prop, datetime(2030, 3, 12, 14), datetime(2030, 3, 13, 12))
    # The morning of the first day is still open by the hour.
    await _blocked(f, hourly, date(2030, 3, 10), date(2030, 3, 12))
    await f.book(hourly, datetime(2030, 3, 10, 9), datetime(2030, 3, 10, 11), RentalMode.HOURLY)


async def test_new_dates_or_a_move_into_a_block_are_refused():
    f = Flats()
    here, there = await f.flat(), await f.flat()
    booking = await f.book(here, datetime(2030, 3, 20, 14), datetime(2030, 3, 21, 12))
    await _blocked(f, here, date(2030, 3, 22), date(2030, 3, 24))
    await _blocked(f, there, date(2030, 3, 20), date(2030, 3, 21))
    with pytest.raises(PropertyBlockedError):
        await f.update.execute(
            UpdateBookingInput(booking_id=booking.id, company_id=COMPANY_ID, check_out=datetime(2030, 3, 23, 12))
        )
    with pytest.raises(PropertyBlockedError):
        await f.move.execute(booking.id, COMPANY_ID, there.id)


async def test_a_block_is_not_put_over_a_booking():
    f = Flats()
    prop = await f.flat()
    await f.book(prop, datetime(2030, 4, 1, 14), datetime(2030, 4, 3, 12))
    with pytest.raises(BlockOverlapsBookingError):
        await _blocked(f, prop, date(2030, 4, 2), date(2030, 4, 4))
    # From the morning the guest leaves, the flat can close.
    await _blocked(f, prop, date(2030, 4, 3), date(2030, 4, 5))


async def test_a_block_has_at_least_one_night_and_its_own_company():
    f = Flats()
    prop = await f.flat()
    svc = ManageBlocksService(f.bookings, f.props)
    with pytest.raises(ValueError, match="end_date"):
        await svc.create(COMPANY_ID, prop.id, date(2030, 5, 2), date(2030, 5, 2))
    with pytest.raises(ValueError, match="Property not found"):
        await svc.create(uuid.uuid4(), prop.id, date(2030, 5, 2), date(2030, 5, 3))


async def test_a_blocked_flat_is_not_offered():
    f = Flats()
    open_flat, closed = await f.flat(), await f.flat()
    await _blocked(f, closed, date(2030, 6, 1), date(2030, 6, 3))
    svc = CheckAvailabilityService(f.props, f.bookings, _build_price_calculator(pricing_repo=f.pricing))
    free = await svc.execute(COMPANY_ID, datetime(2030, 6, 2, 14), datetime(2030, 6, 3, 12), with_prices=False)
    assert [item.property.id for item in free] == [open_flat.id]


@pytest.mark.integration
async def test_blocks_through_the_api(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}/blocks"
    block = {"start_date": "2030-07-10", "end_date": "2030-07-12", "reason": "Ремонт"}

    use(Permission.BOOKINGS_READ)
    assert (await client.post(path, json=block)).status_code == 403

    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE)
    created = await client.post(path, json=block)
    assert created.status_code == 201, created.text
    assert created.json()["reason"] == "Ремонт"
    assert (await client.post(path, json={**block, "end_date": "2030-07-10"})).status_code == 422

    listed = await client.get(path, params={"date_from": "2030-07-01", "date_to": "2030-08-01"})
    assert [b["id"] for b in listed.json()] == [created.json()["id"]]

    stay = {
        "property_id": str(prop),
        "guest_name": "Ерлан",
        "guest_phone": "+77010000917",
        "check_in": "2030-07-11T14:00:00",
        "check_out": "2030-07-12T12:00:00",
    }
    refused = await client.post("/api/v1/bookings", json=stay)
    assert refused.status_code == 409, refused.text
    assert refused.json()["detail"] == "Dates are blocked"

    # Another company's flat: as if it did not exist.
    window = {"date_from": "2030-07-01", "date_to": "2030-08-01"}
    assert (await client.get(f"/api/v1/properties/{uuid.uuid4()}/blocks", params=window)).status_code == 404

    assert (await client.delete(f"{path}/{created.json()['id']}")).status_code == 204
    assert (await client.post("/api/v1/bookings", json=stay)).status_code == 201


@pytest.mark.integration
async def test_a_block_and_a_booking_at_once_do_not_both_get_in(flat):  # noqa: F811  (the imported fixture)
    # Each alone sees the other's nights free; the calendar lock makes one wait.
    import asyncio

    client, prop, use = flat
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE)
    block = {"start_date": "2030-08-10", "end_date": "2030-08-12"}
    stay = {
        "property_id": str(prop),
        "guest_name": "Ерлан",
        "guest_phone": "+77010000918",
        "check_in": "2030-08-10T14:00:00",
        "check_out": "2030-08-11T12:00:00",
    }
    closed, booked = await asyncio.gather(
        client.post(f"/api/v1/properties/{prop}/blocks", json=block),
        client.post("/api/v1/bookings", json=stay),
    )
    assert sorted([closed.status_code, booked.status_code]) == [201, 409], (closed.text, booked.text)


async def test_a_new_check_out_hour_does_not_move_a_block():
    # The block was set while guests left at noon. Check-out moved to 10:00 later
    # must not stretch it over the last hours of a stay that ends at noon that day.
    f = Flats()
    prop = await f.flat()
    await _blocked(f, prop, date(2030, 3, 10), date(2030, 3, 12))
    prop.check_out_hour = 10
    await f.props.save(prop)
    # The morning of the first day stays open, as when the block was set...
    await f.book(prop, datetime(2030, 3, 10, 9), datetime(2030, 3, 10, 11, 30), RentalMode.HOURLY)
    # ...and the flat stays closed until noon of the last one.
    with pytest.raises(PropertyBlockedError):
        await f.book(prop, datetime(2030, 3, 12, 10, 30), datetime(2030, 3, 12, 11, 30), RentalMode.HOURLY)


async def test_edits_read_the_booking_under_its_row_lock():
    # A full-row save from a stale read could put a booking back on nights
    # closed meanwhile: the edit, the move and the status change lock the row first.
    from app.application.booking.change_booking_status import ChangeBookingStatusService
    from app.domain.booking.value_objects import BookingStatus

    f = Flats()
    here, there = await f.flat(), await f.flat()
    booking = await f.book(here, datetime(2030, 9, 1, 14), datetime(2030, 9, 2, 12))
    locked = []
    read = f.bookings.get_for_update

    async def get_for_update(booking_id):
        locked.append(booking_id)
        return await read(booking_id)

    f.bookings.get_for_update = get_for_update
    await f.update.execute(UpdateBookingInput(booking_id=booking.id, company_id=COMPANY_ID, notes="Поздний заезд"))
    await f.move.execute(booking.id, COMPANY_ID, there.id)
    await ChangeBookingStatusService(f.bookings, f.audit).execute(booking.id, COMPANY_ID, BookingStatus.CONFIRMED)
    assert locked == [booking.id, booking.id, booking.id]
