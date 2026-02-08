from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.booking.entities import (
    Booking,
    BookingAuditLog,
    BookingComment,
    BookingContract,
    BookingDeposit,
    BookingFile,
    BookingPayment,
    Guest,
)
from app.domain.booking.repositories import (
    BookingAuditLogRepository,
    BookingCommentRepository,
    BookingContractRepository,
    BookingDepositRepository,
    BookingFileRepository,
    BookingPaymentRepository,
    BookingRepository,
    GuestRepository,
)
from app.domain.property.repositories import PropertyRepository


@dataclass
class BookingDetail:
    booking: Booking
    guest: Guest | None
    property_name: str
    property_internal_name: str
    payments: list[BookingPayment]
    deposits: list[BookingDeposit]
    files: list[BookingFile]
    comments: list[BookingComment]
    contract: BookingContract | None
    audit_logs: list[BookingAuditLog]


class GetBookingService:
    def __init__(
        self,
        booking_repo: BookingRepository,
        guest_repo: GuestRepository,
        property_repo: PropertyRepository,
        payment_repo: BookingPaymentRepository,
        deposit_repo: BookingDepositRepository,
        file_repo: BookingFileRepository,
        comment_repo: BookingCommentRepository,
        contract_repo: BookingContractRepository,
        audit_repo: BookingAuditLogRepository,
    ) -> None:
        self._booking_repo = booking_repo
        self._guest_repo = guest_repo
        self._property_repo = property_repo
        self._payment_repo = payment_repo
        self._deposit_repo = deposit_repo
        self._file_repo = file_repo
        self._comment_repo = comment_repo
        self._contract_repo = contract_repo
        self._audit_repo = audit_repo

    async def execute(
        self, booking_id: uuid.UUID, company_id: uuid.UUID
    ) -> BookingDetail:
        booking = await self._booking_repo.get_by_id(booking_id)
        if booking is None:
            raise ValueError("Booking not found")
        if booking.company_id != company_id:
            raise ValueError("Booking does not belong to company")

        guest = await self._guest_repo.get_by_id(booking.guest_id)
        prop = await self._property_repo.get_by_id(booking.property_id)
        payments = await self._payment_repo.list_by_booking(booking_id)
        deposits = await self._deposit_repo.get_by_booking(booking_id)
        files = await self._file_repo.list_by_booking(booking_id)
        comments = await self._comment_repo.list_by_booking(booking_id)
        contract = await self._contract_repo.get_by_booking(booking_id)
        audit_logs = await self._audit_repo.list_by_booking(booking_id)

        return BookingDetail(
            booking=booking,
            guest=guest,
            property_name=prop.name if prop else "",
            property_internal_name=prop.internal_name if prop else "",
            payments=payments,
            deposits=deposits,
            files=files,
            comments=comments,
            contract=contract,
            audit_logs=audit_logs,
        )
