"""A deposit taken from the Mini App is taken once.

The Mini App offers "Take deposit" only while the booking has no open one. When
the answer to that press is lost, or two phones press at once, a second press
must not take the guest's deposit twice. The app asks for `unless_open`: the
server then refuses a deposit while another one is still open (not returned),
checked under the booking's row lock. Without the flag, as from the web, more
than one deposit stays possible.
"""

import asyncio
import uuid
from decimal import Decimal

import pytest

from app.application.booking.manage_deposits import ManageDepositsService
from app.domain.booking.exceptions import DepositAlreadyOpenError
from tests.test_booking_services import (
    COMPANY_ID,
    FakeBookingDepositRepository,
    FakeBookingRepository,
    _make_booking,
)
from tests.test_crm_booking_create import _body, crm  # noqa: F401  (a fixture)


async def _setup():
    bookings = FakeBookingRepository()
    booking = _make_booking(uuid.uuid4())
    await bookings.create(booking)
    return ManageDepositsService(bookings, FakeBookingDepositRepository()), booking


async def test_a_second_deposit_is_refused_while_the_first_is_open():
    svc, booking = await _setup()
    await svc.create_deposit(booking.id, COMPANY_ID, Decimal("20000"), unless_open=True)
    with pytest.raises(DepositAlreadyOpenError):
        await svc.create_deposit(booking.id, COMPANY_ID, Decimal("20000"), unless_open=True)


async def test_a_returned_deposit_does_not_block_a_new_one():
    svc, booking = await _setup()
    first = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("20000"))
    await svc.perform_action(booking.id, first.id, COMPANY_ID, "pay")
    await svc.perform_action(booking.id, first.id, COMPANY_ID, "return")
    again = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("20000"), unless_open=True)
    assert again.id != first.id


async def test_without_the_flag_a_second_deposit_is_still_taken():
    svc, booking = await _setup()
    await svc.create_deposit(booking.id, COMPANY_ID, Decimal("20000"))
    await svc.create_deposit(booking.id, COMPANY_ID, Decimal("5000"))


# ---------- HTTP against PostgreSQL ----------


async def _booking(client, prop):
    response = await client.post("/api/v1/bookings", json=_body(prop))
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.mark.integration
async def test_a_press_after_a_lost_answer_takes_nothing_more(crm):  # noqa: F811
    client, prop = crm
    path = f"/api/v1/bookings/{await _booking(client, prop)}/deposits"

    first = await client.post(path, json={"amount": "20000", "unless_open": True})
    again = await client.post(path, json={"amount": "20000", "unless_open": True})

    assert first.status_code == 201, first.text
    assert again.status_code == 409
    assert again.json()["detail"] == "Booking already has an open deposit"
    assert len((await client.get(path)).json()) == 1


@pytest.mark.integration
async def test_two_phones_at_once_take_one_deposit(crm):  # noqa: F811
    client, prop = crm
    path = f"/api/v1/bookings/{await _booking(client, prop)}/deposits"

    a, b = await asyncio.gather(
        client.post(path, json={"amount": "20000", "unless_open": True}),
        client.post(path, json={"amount": "20000", "unless_open": True}),
    )

    assert sorted([a.status_code, b.status_code]) == [201, 409], (a.text, b.text)
    assert len((await client.get(path)).json()) == 1
