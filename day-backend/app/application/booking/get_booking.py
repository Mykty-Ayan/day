from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.auth.repositories import UserRepository
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
from app.domain.booking.value_objects import BookingStatus
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
    # The guest's stays with the company, this one included; cancelled ones don't count.
    guest_stays: int
    # Who changed the booking or commented on it, by user id; the company's users only.
    people: dict[uuid.UUID, str]


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
        user_repo: UserRepository,
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
        self._user_repo = user_repo

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
        stays = await self._booking_repo.list_by_guest(company_id, booking.guest_id)

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
            guest_stays=sum(1 for stay in stays if stay.status != BookingStatus.CANCELLED),
            people=await self._people(company_id, audit_logs, comments),
        )

    async def _people(
        self, company_id: uuid.UUID, logs: list[BookingAuditLog], comments: list[BookingComment]
    ) -> dict[uuid.UUID, str]:
        ids = {log.changed_by for log in logs} | {comment.author_id for comment in comments}
        names: dict[uuid.UUID, str] = {}
        # One read per person: a booking is touched by a handful of them.
        for user_id in ids - {None}:
            user = await self._user_repo.get_by_id(user_id)
            if user is not None and user.company_id == company_id:
                names[user_id] = user.full_name or user.email
        return names
