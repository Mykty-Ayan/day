from __future__ import annotations

import uuid

from app.domain.booking.entities import BookingAuditLog, Booking
from app.domain.booking.repositories import (
    BookingAuditLogRepository,
    BookingRepository,
)
from app.domain.booking.value_objects import BookingAuditAction, BookingStatus


class ChangeBookingStatusService:
    def __init__(
        self,
        booking_repo: BookingRepository,
        audit_repo: BookingAuditLogRepository,
    ) -> None:
        self._booking_repo = booking_repo
        self._audit_repo = audit_repo

    async def execute(
        self,
        booking_id: uuid.UUID,
        company_id: uuid.UUID,
        target_status: BookingStatus,
        *,
        changed_by: uuid.UUID | None = None,
    ) -> Booking:
        booking = await self._booking_repo.get_by_id(booking_id)
        if booking is None:
            raise ValueError("Booking not found")
        if booking.company_id != company_id:
            raise ValueError("Booking does not belong to company")

        old_status = booking.status
        booking.change_status(target_status)

        updated = await self._booking_repo.update(booking)

        await self._audit_repo.create(
            BookingAuditLog(
                booking_id=updated.id,
                changed_by=changed_by,
                field_name="status",
                old_value=old_status.value,
                new_value=target_status.value,
                action=BookingAuditAction.STATUS_CHANGE,
            )
        )

        return updated
