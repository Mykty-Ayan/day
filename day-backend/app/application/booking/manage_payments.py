from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from app.domain.booking.entities import BookingPayment
from app.domain.booking.repositories import (
    BookingPaymentRepository,
    BookingRepository,
)
from app.domain.booking.value_objects import PaymentMethod, PaymentStatus, PaymentType


class ManagePaymentsService:
    def __init__(
        self,
        booking_repo: BookingRepository,
        payment_repo: BookingPaymentRepository,
    ) -> None:
        self._booking_repo = booking_repo
        self._payment_repo = payment_repo

    async def add_payment(
        self,
        booking_id: uuid.UUID,
        company_id: uuid.UUID,
        amount: Decimal,
        payment_type: PaymentType,
        method: PaymentMethod,
        note: str | None = None,
    ) -> BookingPayment:
        booking = await self._booking_repo.get_by_id(booking_id)
        if booking is None:
            raise ValueError("Booking not found")
        if booking.company_id != company_id:
            raise ValueError("Booking does not belong to company")

        return await self._payment_repo.create(
            BookingPayment(
                booking_id=booking_id,
                amount=amount,
                type=payment_type,
                method=method,
                status=PaymentStatus.COMPLETED,
                note=note,
                paid_at=datetime.utcnow(),
            )
        )

    async def list_payments(
        self, booking_id: uuid.UUID, company_id: uuid.UUID
    ) -> list[BookingPayment]:
        booking = await self._booking_repo.get_by_id(booking_id)
        if booking is None:
            raise ValueError("Booking not found")
        if booking.company_id != company_id:
            raise ValueError("Booking does not belong to company")
        return await self._payment_repo.list_by_booking(booking_id)
