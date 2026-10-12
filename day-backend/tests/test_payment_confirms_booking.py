"""Money that arrived confirms the stay it was paid for.

The CRM records a payment when the guest pays (often a transfer still to be
checked, so pending) and confirms it when the money shows up. A confirmed
payment turns a pending booking, or a hold, into a confirmed one. A retried
request must never record the money twice.
"""

import asyncio
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from app.application.booking.manage_payments import ManagePaymentsService
from app.domain.booking.exceptions import IdempotencyKeyReusedError
from app.domain.booking.value_objects import (
    BookingAuditAction,
    BookingStatus,
    PaymentMethod,
    PaymentStatus,
    PaymentType,
)
from tests.test_booking_services import (
    COMPANY_ID,
    FakeBookingAuditLogRepository,
    FakeBookingPaymentRepository,
    FakeBookingRepository,
    _make_booking,
)
from tests.test_crm_booking_create import _body, crm  # noqa: F401  (a fixture)

USER = uuid.uuid4()


async def _setup(status=BookingStatus.PENDING, **kw):
    bookings, payments, audit = FakeBookingRepository(), FakeBookingPaymentRepository(), FakeBookingAuditLogRepository()
    booking = _make_booking(uuid.uuid4(), status=status, **kw)
    await bookings.create(booking)
    return bookings, payments, audit, ManagePaymentsService(bookings, payments, audit), booking


async def _pay(svc, booking, **kw):
    return await svc.add_payment(
        booking.id, COMPANY_ID, kw.pop("amount", Decimal("10000")), kw.pop("payment_type", PaymentType.PAYMENT),
        PaymentMethod.TRANSFER, changed_by=USER, **kw,
    )


# ---------- the rule ----------


async def test_a_completed_payment_confirms_a_pending_booking_and_ends_its_hold():
    bookings, _, audit, svc, booking = await _setup(expires_at=datetime.utcnow() + timedelta(hours=8))

    await _pay(svc, booking)

    after = await bookings.get_by_id(booking.id)
    assert (after.status, after.expires_at) == (BookingStatus.CONFIRMED, None)
    [log] = await audit.list_by_booking(booking.id)
    assert (log.action, log.old_value, log.new_value, log.changed_by) == (
        BookingAuditAction.STATUS_CHANGE, "pending", "confirmed", USER,
    )


async def test_a_pending_payment_confirms_nothing_until_it_is_confirmed():
    bookings, _, _, svc, booking = await _setup()

    payment = await _pay(svc, booking, status=PaymentStatus.PENDING)
    assert (payment.status, payment.paid_at) == (PaymentStatus.PENDING, None)
    assert (await bookings.get_by_id(booking.id)).status == BookingStatus.PENDING

    confirmed = await svc.confirm_payment(booking.id, payment.id, COMPANY_ID, changed_by=USER)
    assert confirmed.status == PaymentStatus.COMPLETED
    assert confirmed.paid_at is not None
    assert (await bookings.get_by_id(booking.id)).status == BookingStatus.CONFIRMED


async def test_confirming_twice_changes_nothing():
    _, _, _, svc, booking = await _setup()
    payment = await _pay(svc, booking, status=PaymentStatus.PENDING)
    first = await svc.confirm_payment(booking.id, payment.id, COMPANY_ID)
    again = await svc.confirm_payment(booking.id, payment.id, COMPANY_ID)
    assert again.paid_at == first.paid_at


async def test_a_refund_confirms_nothing():
    bookings, _, _, svc, booking = await _setup()
    await _pay(svc, booking, payment_type=PaymentType.REFUND)
    assert (await bookings.get_by_id(booking.id)).status == BookingStatus.PENDING


@pytest.mark.parametrize("status", [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CANCELLED])
async def test_money_for_a_booking_past_pending_is_recorded_and_the_status_kept(status):
    bookings, payments, _, svc, booking = await _setup(status=status)
    await _pay(svc, booking)
    assert (await bookings.get_by_id(booking.id)).status == status
    assert len(await payments.list_by_booking(booking.id)) == 1


async def test_a_payment_of_another_booking_cannot_be_confirmed_through_this_one():
    bookings, _, _, svc, booking = await _setup()
    payment = await _pay(svc, booking, status=PaymentStatus.PENDING)
    other = _make_booking(uuid.uuid4())
    await bookings.create(other)
    with pytest.raises(ValueError, match="Payment not found"):
        await svc.confirm_payment(other.id, payment.id, COMPANY_ID)


# ---------- idempotency ----------


async def test_the_same_key_and_request_replay_the_payment():
    _, _, _, svc, booking = await _setup()
    first = await _pay(svc, booking, idempotency_key="k1", idempotency_hash="h1", external_id="pay-1")
    assert first.external_id == "pay-1"
    assert (await svc.replay_payment(booking.id, COMPANY_ID, "k1", "h1")).id == first.id
    with pytest.raises(IdempotencyKeyReusedError):
        await svc.replay_payment(booking.id, COMPANY_ID, "k1", "h2")
    assert await svc.replay_payment(booking.id, COMPANY_ID, "k2", "h1") is None


# ---------- HTTP against PostgreSQL ----------


async def _booking(client, prop, **kw):
    response = await client.post("/api/v1/bookings", json=_body(prop, **kw))
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.mark.integration
async def test_a_paid_hold_is_confirmed_and_a_retry_records_the_money_once(crm):  # noqa: F811
    client, prop = crm
    booking_id = await _booking(client, prop, expires_at="2099-01-01T09:00:00+05:00")
    path = f"/api/v1/bookings/{booking_id}/payments"
    body = {"amount": "20000", "method": "transfer", "external_id": "kaspi-123"}
    headers = {"Idempotency-Key": "deal-42-pay-1"}

    first = await client.post(path, json=body, headers=headers)
    again = await client.post(path, json=body, headers=headers)
    other = await client.post(path, json={**body, "amount": "1"}, headers=headers)

    assert first.status_code == 201, first.text
    assert (first.json()["status"], first.json()["external_id"]) == ("completed", "kaspi-123")
    assert again.status_code == 200
    assert again.headers["Idempotent-Replayed"] == "true"
    assert again.json()["id"] == first.json()["id"]
    assert other.status_code == 422
    assert len((await client.get(path)).json()) == 1

    booking = (await client.get(f"/api/v1/bookings/{booking_id}")).json()["booking"]
    assert (booking["status"], booking["expires_at"]) == ("confirmed", None)


@pytest.mark.integration
async def test_a_pending_payment_counts_once_it_is_confirmed(crm):  # noqa: F811
    client, prop = crm
    booking_id = await _booking(client, prop)
    path = f"/api/v1/bookings/{booking_id}/payments"

    pending = await client.post(path, json={"amount": "5000", "method": "transfer", "status": "pending"})
    assert pending.status_code == 201, pending.text
    assert pending.json()["status"] == "pending"

    listed = (await client.get("/api/v1/bookings")).json()["items"]
    assert [b["paid_amount"] for b in listed if b["id"] == booking_id] == [0]
    assert (await client.get(f"/api/v1/bookings/{booking_id}")).json()["booking"]["status"] == "pending"

    confirmed = await client.post(f"{path}/{pending.json()['id']}/confirm")
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "completed"

    listed = (await client.get("/api/v1/bookings")).json()["items"]
    assert [b["paid_amount"] for b in listed if b["id"] == booking_id] == [5000]
    assert (await client.get(f"/api/v1/bookings/{booking_id}")).json()["booking"]["status"] == "confirmed"


@pytest.mark.integration
async def test_a_failed_status_cannot_be_posted(crm):  # noqa: F811
    client, prop = crm
    booking_id = await _booking(client, prop)
    response = await client.post(
        f"/api/v1/bookings/{booking_id}/payments", json={"amount": "5000", "status": "failed"}
    )
    assert response.status_code == 422


@pytest.mark.integration
async def test_two_identical_payments_at_once_record_the_money_once(crm):  # noqa: F811
    client, prop = crm
    booking_id = await _booking(client, prop)
    path = f"/api/v1/bookings/{booking_id}/payments"
    body, headers = {"amount": "20000", "method": "card"}, {"Idempotency-Key": "pay-once"}

    a, b = await asyncio.gather(
        client.post(path, json=body, headers=headers),
        client.post(path, json=body, headers=headers),
    )

    assert sorted([a.status_code, b.status_code]) == [200, 201], (a.text, b.text)
    assert len((await client.get(path)).json()) == 1
