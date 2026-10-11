from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from app.application.booking.change_booking_status import ChangeBookingStatusService
from app.domain.booking.entities import Booking, BookingPayment
from app.domain.booking.exceptions import IdempotencyKeyReusedError
from app.domain.booking.repositories import (
    BookingAuditLogRepository,
    BookingPaymentRepository,
    BookingRepository,
)
from app.domain.booking.value_objects import BookingStatus, PaymentMethod, PaymentStatus, PaymentType


class ManagePaymentsService:
    def __init__(
        self,
        booking_repo: BookingRepository,
        payment_repo: BookingPaymentRepository,
        audit_repo: BookingAuditLogRepository,
    ) -> None:
        self._booking_repo = booking_repo
        self._payment_repo = payment_repo
        self._status = ChangeBookingStatusService(booking_repo, audit_repo)

    async def _own_booking(self, booking_id: uuid.UUID, company_id: uuid.UUID) -> Booking:
        booking = await self._booking_repo.get_by_id(booking_id)
        if booking is None:
            raise ValueError("Booking not found")
        if booking.company_id != company_id:
            raise ValueError("Booking does not belong to company")
        return booking

    async def _confirm_paid_booking(
        self, booking: Booking, payment: BookingPayment, changed_by: uuid.UUID | None
    ) -> None:
        """Money received for a pending booking (or a hold) confirms it.

        Any amount counts. A booking already past pending keeps its status:
        money for a cancelled stay is the host's call, not the system's.
        """
        if (
            payment.type == PaymentType.PAYMENT
            and payment.status == PaymentStatus.COMPLETED
            and booking.status == BookingStatus.PENDING
        ):
            await self._status.execute(booking.id, booking.company_id, BookingStatus.CONFIRMED, changed_by=changed_by)

    async def replay_payment(
        self, booking_id: uuid.UUID, company_id: uuid.UUID, key: str, request_hash: str
    ) -> BookingPayment | None:
        """The payment an earlier request with this Idempotency-Key recorded, if any.

        Takes a lock on the key first, so call it in the transaction that will
        record the payment.
        """
        await self._own_booking(booking_id, company_id)
        await self._payment_repo.lock_idempotency_key(booking_id, key)
        payment = await self._payment_repo.get_by_idempotency_key(booking_id, key)
        if payment is not None and payment.idempotency_hash != request_hash:
            raise IdempotencyKeyReusedError()
        return payment

    async def add_payment(
        self,
        booking_id: uuid.UUID,
        company_id: uuid.UUID,
        amount: Decimal,
        payment_type: PaymentType,
        method: PaymentMethod,
        note: str | None = None,
        *,
        status: PaymentStatus = PaymentStatus.COMPLETED,
        external_id: str | None = None,
        idempotency_key: str | None = None,
        idempotency_hash: str | None = None,
        changed_by: uuid.UUID | None = None,
    ) -> BookingPayment:
        booking = await self._own_booking(booking_id, company_id)
        if status not in (PaymentStatus.PENDING, PaymentStatus.COMPLETED):
            raise ValueError("A payment is recorded as pending or completed")

        payment = await self._payment_repo.create(
            BookingPayment(
                booking_id=booking_id,
                amount=amount,
                type=payment_type,
                method=method,
                status=status,
                note=note,
                paid_at=datetime.utcnow() if status == PaymentStatus.COMPLETED else None,
                external_id=external_id,
                idempotency_key=idempotency_key,
                idempotency_hash=idempotency_hash,
            )
        )
        await self._confirm_paid_booking(booking, payment, changed_by)
        return payment

    async def confirm_payment(
        self,
        booking_id: uuid.UUID,
        payment_id: uuid.UUID,
        company_id: uuid.UUID,
        *,
        changed_by: uuid.UUID | None = None,
    ) -> BookingPayment:
        """The money of a pending payment arrived. Confirming twice is harmless."""
        booking = await self._own_booking(booking_id, company_id)
        payment = await self._payment_repo.get_by_id(payment_id)
        if payment is None or payment.booking_id != booking_id:
            raise ValueError("Payment not found")
        if payment.status == PaymentStatus.COMPLETED:
            return payment
        if payment.status != PaymentStatus.PENDING:
            raise ValueError(f"A {payment.status.value} payment cannot be confirmed")

        payment.status = PaymentStatus.COMPLETED
        payment.paid_at = datetime.utcnow()
        payment = await self._payment_repo.update(payment)
        await self._confirm_paid_booking(booking, payment, changed_by)
        return payment

    async def list_payments(
        self, booking_id: uuid.UUID, company_id: uuid.UUID
    ) -> list[BookingPayment]:
        await self._own_booking(booking_id, company_id)
        return await self._payment_repo.list_by_booking(booking_id)
