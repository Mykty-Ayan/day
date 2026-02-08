from __future__ import annotations

import uuid
from decimal import Decimal

from app.domain.booking.entities import BookingDeposit
from app.domain.booking.repositories import (
    BookingDepositRepository,
    BookingRepository,
)
from app.domain.booking.value_objects import DepositStatus


class ManageDepositsService:
    def __init__(
        self,
        booking_repo: BookingRepository,
        deposit_repo: BookingDepositRepository,
    ) -> None:
        self._booking_repo = booking_repo
        self._deposit_repo = deposit_repo

    async def create_deposit(
        self,
        booking_id: uuid.UUID,
        company_id: uuid.UUID,
        amount: Decimal,
    ) -> BookingDeposit:
        booking = await self._booking_repo.get_by_id(booking_id)
        if booking is None:
            raise ValueError("Booking not found")
        if booking.company_id != company_id:
            raise ValueError("Booking does not belong to company")

        return await self._deposit_repo.create(
            BookingDeposit(
                booking_id=booking_id,
                amount=amount,
                status=DepositStatus.PENDING,
            )
        )

    async def perform_action(
        self,
        booking_id: uuid.UUID,
        deposit_id: uuid.UUID,
        company_id: uuid.UUID,
        action: str,
        held_amount: Decimal | None = None,
        reason: str | None = None,
    ) -> BookingDeposit:
        booking = await self._booking_repo.get_by_id(booking_id)
        if booking is None:
            raise ValueError("Booking not found")
        if booking.company_id != company_id:
            raise ValueError("Booking does not belong to company")

        deposit = await self._deposit_repo.get_by_id(deposit_id)
        if deposit is None:
            raise ValueError("Deposit not found")
        if deposit.booking_id != booking_id:
            raise ValueError("Deposit does not belong to booking")

        if action == "pay":
            target = DepositStatus.PAID
        elif action == "return":
            target = DepositStatus.RETURNED
        elif action == "hold":
            target = DepositStatus.HELD
            deposit.held_amount = deposit.amount
            deposit.reason = reason
        elif action == "partial_hold":
            target = DepositStatus.PARTIALLY_HELD
            if held_amount is None or held_amount <= 0:
                raise ValueError("held_amount is required for partial hold")
            if held_amount > deposit.amount:
                raise ValueError("held_amount cannot exceed deposit amount")
            deposit.held_amount = held_amount
            deposit.reason = reason
        else:
            raise ValueError(f"Unknown action: {action}")

        if not deposit.status.can_transition_to(target):
            raise ValueError(
                f"Cannot transition deposit from {deposit.status.value} to {target.value}"
            )

        deposit.status = target
        return await self._deposit_repo.update(deposit)

    async def list_deposits(
        self, booking_id: uuid.UUID, company_id: uuid.UUID
    ) -> list[BookingDeposit]:
        booking = await self._booking_repo.get_by_id(booking_id)
        if booking is None:
            raise ValueError("Booking not found")
        if booking.company_id != company_id:
            raise ValueError("Booking does not belong to company")
        return await self._deposit_repo.get_by_booking(booking_id)
