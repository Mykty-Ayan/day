"""A guest's name and phone can be corrected, within the company, without two guests on one number."""

import uuid

import pytest

from app.application.booking.update_guest import (
    GuestNotFound,
    GuestPhoneTaken,
    UpdateGuestInput,
    UpdateGuestService,
)
from app.domain.booking.entities import Booking, Guest
from app.domain.booking.value_objects import BookingAuditAction
from tests.test_booking_services import (
    COMPANY_ID,
    OTHER_COMPANY_ID,
    FakeBookingAuditLogRepository,
    FakeBookingRepository,
    FakeGuestRepository,
)

pytestmark = pytest.mark.asyncio


async def _guests(*guests: Guest) -> FakeGuestRepository:
    repo = FakeGuestRepository()
    for guest in guests:
        await repo.create(guest)
    return repo


def _service(repo: FakeGuestRepository, bookings=None, audit=None) -> UpdateGuestService:
    return UpdateGuestService(repo, bookings or FakeBookingRepository(), audit or FakeBookingAuditLogRepository())


async def test_name_and_phone_are_corrected_and_trimmed():
    ann = Guest(company_id=COMPANY_ID, name="Ann", phone="+77001112233")
    repo = await _guests(ann)

    saved = await _service(repo).execute(
        UpdateGuestInput(company_id=COMPANY_ID, guest_id=ann.id, name="  Анна  ", phone=" +77009998877 ")
    )

    assert (saved.name, saved.phone) == ("Анна", "+77009998877")
    assert (await repo.get_by_id(ann.id)).name == "Анна"


async def test_what_is_not_sent_stays_and_an_empty_phone_removes_it():
    ann = Guest(company_id=COMPANY_ID, name="Ann", phone="+77001112233")
    svc = _service(await _guests(ann))

    assert (await svc.execute(UpdateGuestInput(company_id=COMPANY_ID, guest_id=ann.id, name="Анна"))).phone == (
        "+77001112233"
    )
    assert (await svc.execute(UpdateGuestInput(company_id=COMPANY_ID, guest_id=ann.id, phone=""))).phone is None


async def test_another_guests_phone_is_refused():
    ann = Guest(company_id=COMPANY_ID, name="Ann", phone="+77001112233")
    bob = Guest(company_id=COMPANY_ID, name="Bob", phone="+77009998877")
    theirs = Guest(company_id=OTHER_COMPANY_ID, name="Eve", phone="+77005554433")
    repo = await _guests(ann, bob, theirs)
    svc = _service(repo)

    with pytest.raises(GuestPhoneTaken):
        await svc.execute(UpdateGuestInput(company_id=COMPANY_ID, guest_id=ann.id, phone="+77009998877"))
    assert (await repo.get_by_id(ann.id)).phone == "+77001112233"

    # Another company's guest is no conflict, and sending back one's own phone is no change.
    assert (await svc.execute(UpdateGuestInput(company_id=COMPANY_ID, guest_id=ann.id, phone="+77005554433"))).phone
    bob_twin = Guest(company_id=COMPANY_ID, name="Bob again", phone="+77009998877")
    await repo.create(bob_twin)
    saved = await svc.execute(
        UpdateGuestInput(company_id=COMPANY_ID, guest_id=bob.id, name="Bob B", phone="+77009998877")
    )
    assert saved.name == "Bob B"


async def test_another_companys_guest_is_not_found_and_a_blank_name_is_refused():
    theirs = Guest(company_id=OTHER_COMPANY_ID, name="Eve")
    ann = Guest(company_id=COMPANY_ID, name="Ann")
    svc = _service(await _guests(theirs, ann))

    for guest_id in (theirs.id, uuid.uuid4()):
        with pytest.raises(GuestNotFound):
            await svc.execute(UpdateGuestInput(company_id=COMPANY_ID, guest_id=guest_id, name="X"))
    with pytest.raises(ValueError):
        await svc.execute(UpdateGuestInput(company_id=COMPANY_ID, guest_id=ann.id, name="   "))


async def test_a_change_is_logged_on_each_booking_of_the_guest_and_no_change_is_not():
    ann = Guest(company_id=COMPANY_ID, name="Ann", phone="+77001112233")
    bob = Guest(company_id=COMPANY_ID, name="Bob")
    bookings, audit = FakeBookingRepository(), FakeBookingAuditLogRepository()
    first = await bookings.create(Booking(company_id=COMPANY_ID, guest_id=ann.id))
    second = await bookings.create(Booking(company_id=COMPANY_ID, guest_id=ann.id))
    other = await bookings.create(Booking(company_id=COMPANY_ID, guest_id=bob.id))
    theirs = await bookings.create(Booking(company_id=OTHER_COMPANY_ID, guest_id=ann.id))
    svc = _service(await _guests(ann, bob), bookings, audit)
    editor = uuid.uuid4()

    # The same values sent back log nothing.
    await svc.execute(UpdateGuestInput(company_id=COMPANY_ID, guest_id=ann.id, name="Ann", phone="+77001112233"))
    assert audit._logs == []

    await svc.execute(UpdateGuestInput(company_id=COMPANY_ID, guest_id=ann.id, name="Анна", changed_by=editor))
    for booking in (first, second):
        log = await audit.list_by_booking(booking.id)
        assert [(x.field_name, x.old_value, x.new_value, x.action, x.changed_by) for x in log] == [
            ("guest_name", "Ann", "Анна", BookingAuditAction.UPDATE, editor)
        ]
    assert await audit.list_by_booking(other.id) == []
    assert await audit.list_by_booking(theirs.id) == []

    await svc.execute(UpdateGuestInput(company_id=COMPANY_ID, guest_id=ann.id, phone=""))
    assert [(x.field_name, x.old_value, x.new_value) for x in (await audit.list_by_booking(first.id))[1:]] == [
        ("guest_phone", "+77001112233", None)
    ]
