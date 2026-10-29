"""A guest's name and phone can be corrected, within the company, without two guests on one number."""

import uuid

import pytest

from app.application.booking.update_guest import (
    GuestNotFound,
    GuestPhoneTaken,
    UpdateGuestInput,
    UpdateGuestService,
)
from app.domain.booking.entities import Guest
from tests.test_booking_services import COMPANY_ID, OTHER_COMPANY_ID, FakeGuestRepository

pytestmark = pytest.mark.asyncio


async def _guests(*guests: Guest) -> FakeGuestRepository:
    repo = FakeGuestRepository()
    for guest in guests:
        await repo.create(guest)
    return repo


async def test_name_and_phone_are_corrected_and_trimmed():
    ann = Guest(company_id=COMPANY_ID, name="Ann", phone="+77001112233")
    repo = await _guests(ann)

    saved = await UpdateGuestService(repo).execute(
        UpdateGuestInput(company_id=COMPANY_ID, guest_id=ann.id, name="  Анна  ", phone=" +77009998877 ")
    )

    assert (saved.name, saved.phone) == ("Анна", "+77009998877")
    assert (await repo.get_by_id(ann.id)).name == "Анна"


async def test_what_is_not_sent_stays_and_an_empty_phone_removes_it():
    ann = Guest(company_id=COMPANY_ID, name="Ann", phone="+77001112233")
    svc = UpdateGuestService(await _guests(ann))

    assert (await svc.execute(UpdateGuestInput(company_id=COMPANY_ID, guest_id=ann.id, name="Анна"))).phone == (
        "+77001112233"
    )
    assert (await svc.execute(UpdateGuestInput(company_id=COMPANY_ID, guest_id=ann.id, phone=""))).phone is None


async def test_another_guests_phone_is_refused():
    ann = Guest(company_id=COMPANY_ID, name="Ann", phone="+77001112233")
    bob = Guest(company_id=COMPANY_ID, name="Bob", phone="+77009998877")
    theirs = Guest(company_id=OTHER_COMPANY_ID, name="Eve", phone="+77005554433")
    repo = await _guests(ann, bob, theirs)
    svc = UpdateGuestService(repo)

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
    svc = UpdateGuestService(await _guests(theirs, ann))

    for guest_id in (theirs.id, uuid.uuid4()):
        with pytest.raises(GuestNotFound):
            await svc.execute(UpdateGuestInput(company_id=COMPANY_ID, guest_id=guest_id, name="X"))
    with pytest.raises(ValueError):
        await svc.execute(UpdateGuestInput(company_id=COMPANY_ID, guest_id=ann.id, name="   "))
