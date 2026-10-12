"""Closing an Idempotency-Key whose answer was lost.

A client that sent a booking or a payment and got no answer cannot tell whether
it was made. An empty list proves nothing: the request may still be on its way,
or waiting for the key's lock. Voiding the key settles it on the server: either
the request already made its record (the answer names it), or the key is closed
and a late request with it is refused. Only then may the client start afresh.
"""

import asyncio
import uuid
from decimal import Decimal

import pytest

from app.application.booking.manage_payments import ManagePaymentsService
from app.domain.booking.exceptions import IdempotencyKeyVoidedError
from app.domain.booking.value_objects import PaymentMethod, PaymentType
from tests.test_booking_services import (
    COMPANY_ID,
    OTHER_COMPANY_ID,
    FakeBookingAuditLogRepository,
    FakeBookingPaymentRepository,
    FakeBookingRepository,
    _make_booking,
)
from tests.test_crm_booking_create import _body, _input, _service, crm  # noqa: F401  (crm is a fixture)

# ---------- bookings ----------


async def test_a_voided_booking_key_refuses_a_late_request():
    svc, _ = await _service()
    assert await svc.void(COMPANY_ID, "k1") is None
    with pytest.raises(IdempotencyKeyVoidedError):
        await svc.replay(COMPANY_ID, "k1", "h1")


async def test_voiding_a_key_that_made_a_booking_names_the_booking():
    svc, prop = await _service()
    made = await svc.execute(_input(prop.id, idempotency_key="k1", idempotency_hash="h1"))
    assert (await svc.void(COMPANY_ID, "k1")).id == made.id
    # The key was not closed: a retry still gets its booking.
    assert (await svc.replay(COMPANY_ID, "k1", "h1")).id == made.id


async def test_voiding_twice_is_harmless():
    svc, _ = await _service()
    assert await svc.void(COMPANY_ID, "k1") is None
    assert await svc.void(COMPANY_ID, "k1") is None


async def test_a_voided_booking_key_is_closed_for_its_company_only():
    svc, _ = await _service()
    await svc.void(OTHER_COMPANY_ID, "k1")
    assert await svc.replay(COMPANY_ID, "k1", "h1") is None


# ---------- payments ----------


async def _payments():
    bookings, payments = FakeBookingRepository(), FakeBookingPaymentRepository()
    booking = _make_booking(uuid.uuid4())
    await bookings.create(booking)
    return ManagePaymentsService(bookings, payments, FakeBookingAuditLogRepository()), booking


async def test_a_voided_payment_key_refuses_a_late_request():
    svc, booking = await _payments()
    assert await svc.void_payment_key(booking.id, COMPANY_ID, "k1") is None
    with pytest.raises(IdempotencyKeyVoidedError):
        await svc.replay_payment(booking.id, COMPANY_ID, "k1", "h1")


async def test_voiding_a_key_that_recorded_a_payment_names_the_payment():
    svc, booking = await _payments()
    paid = await svc.add_payment(
        booking.id, COMPANY_ID, Decimal("10000"), PaymentType.PAYMENT, PaymentMethod.CASH,
        idempotency_key="k1", idempotency_hash="h1",
    )
    assert (await svc.void_payment_key(booking.id, COMPANY_ID, "k1")).id == paid.id
    assert (await svc.replay_payment(booking.id, COMPANY_ID, "k1", "h1")).id == paid.id


async def test_a_payment_key_of_another_company_booking_cannot_be_voided():
    svc, booking = await _payments()
    with pytest.raises(ValueError):
        await svc.void_payment_key(booking.id, OTHER_COMPANY_ID, "k1")
    assert await svc.replay_payment(booking.id, COMPANY_ID, "k1", "h1") is None


# ---------- HTTP against PostgreSQL ----------

VOID_BOOKING = "/api/v1/bookings/idempotency-keys/{}/void"


@pytest.mark.integration
async def test_a_booking_sent_after_its_key_was_voided_is_refused(crm):  # noqa: F811
    client, prop = crm
    voided = await client.post(VOID_BOOKING.format("lost-1"))
    late = await client.post("/api/v1/bookings", json=_body(prop), headers={"Idempotency-Key": "lost-1"})

    assert voided.status_code == 200, voided.text
    assert voided.json() == {"voided": True, "booking": None}
    assert late.status_code == 409
    assert late.json()["detail"] == "Idempotency-Key was voided"
    assert (await client.get("/api/v1/bookings")).json()["items"] == []


@pytest.mark.integration
async def test_voiding_the_key_of_a_made_booking_returns_it(crm):  # noqa: F811
    client, prop = crm
    made = await client.post("/api/v1/bookings", json=_body(prop), headers={"Idempotency-Key": "made-1"})
    voided = await client.post(VOID_BOOKING.format("made-1"))

    assert made.status_code == 201, made.text
    assert voided.status_code == 200, voided.text
    assert voided.json()["voided"] is False
    assert voided.json()["booking"]["id"] == made.json()["id"]


@pytest.mark.integration
async def test_a_booking_and_a_void_at_once_never_both_win(crm):  # noqa: F811
    client, prop = crm
    for attempt in range(5):
        key = f"race-{attempt}"
        sent, voided = await asyncio.gather(
            client.post(
                "/api/v1/bookings",
                json=_body(prop, check_in=f"2026-11-{10 + 2 * attempt}T14:00:00",
                           check_out=f"2026-11-{11 + 2 * attempt}T12:00:00"),
                headers={"Idempotency-Key": key},
            ),
            client.post(VOID_BOOKING.format(key)),
        )
        assert voided.status_code == 200, voided.text
        if voided.json()["voided"]:
            assert sent.status_code == 409, sent.text
        else:
            assert sent.status_code == 201, sent.text
            assert voided.json()["booking"]["id"] == sent.json()["id"]


@pytest.mark.integration
async def test_an_over_long_key_cannot_be_voided(crm):  # noqa: F811
    client, _ = crm
    assert (await client.post(VOID_BOOKING.format("k" * 256))).status_code == 422


@pytest.mark.integration
async def test_a_payment_sent_after_its_key_was_voided_is_refused(crm):  # noqa: F811
    client, prop = crm
    booking_id = (await client.post("/api/v1/bookings", json=_body(prop))).json()["id"]
    path = f"/api/v1/bookings/{booking_id}/payments"

    voided = await client.post(f"{path}/idempotency-keys/pay-lost/void")
    late = await client.post(path, json={"amount": "20000", "method": "cash"}, headers={"Idempotency-Key": "pay-lost"})

    assert voided.status_code == 200, voided.text
    assert voided.json() == {"voided": True, "payment": None}
    assert late.status_code == 409
    assert late.json()["detail"] == "Idempotency-Key was voided"
    assert (await client.get(path)).json() == []


@pytest.mark.integration
async def test_voiding_the_key_of_a_recorded_payment_returns_it(crm):  # noqa: F811
    client, prop = crm
    booking_id = (await client.post("/api/v1/bookings", json=_body(prop))).json()["id"]
    path = f"/api/v1/bookings/{booking_id}/payments"
    paid = await client.post(path, json={"amount": "20000", "method": "cash"}, headers={"Idempotency-Key": "pay-1"})

    voided = await client.post(f"{path}/idempotency-keys/pay-1/void")

    assert voided.status_code == 200, voided.text
    assert voided.json()["voided"] is False
    assert voided.json()["payment"]["id"] == paid.json()["id"]


@pytest.mark.integration
async def test_a_payment_and_a_void_at_once_never_both_win(crm):  # noqa: F811
    client, prop = crm
    booking_id = (await client.post("/api/v1/bookings", json=_body(prop))).json()["id"]
    path = f"/api/v1/bookings/{booking_id}/payments"
    for attempt in range(5):
        key = f"pay-race-{attempt}"
        sent, voided = await asyncio.gather(
            client.post(path, json={"amount": "1000", "method": "cash"}, headers={"Idempotency-Key": key}),
            client.post(f"{path}/idempotency-keys/{key}/void"),
        )
        assert voided.status_code == 200, voided.text
        if voided.json()["voided"]:
            assert sent.status_code == 409, sent.text
        else:
            assert sent.status_code == 201, sent.text
            assert voided.json()["payment"]["id"] == sent.json()["id"]


@pytest.mark.integration
async def test_a_payment_key_of_an_unknown_booking_is_a_404(crm):  # noqa: F811
    client, _ = crm
    response = await client.post(f"/api/v1/bookings/{uuid.uuid4()}/payments/idempotency-keys/k1/void")
    assert response.status_code == 404
