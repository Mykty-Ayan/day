"""Let the nights of an unconfirmed hold go once its time is up."""

from __future__ import annotations

from datetime import datetime

from app.application.booking.change_booking_status import ChangeBookingStatusService
from app.domain.booking.entities import Booking
from app.domain.booking.repositories import BookingAuditLogRepository, BookingRepository
from app.domain.booking.value_objects import BookingStatus

# Holds per pass. The sweep runs every minute, so a backlog clears in a few.
_BATCH = 100


class ExpireHoldsService:
    def __init__(self, booking_repo: BookingRepository, audit_repo: BookingAuditLogRepository) -> None:
        self._booking_repo = booking_repo
        self._status = ChangeBookingStatusService(booking_repo, audit_repo)

    async def execute(self, now: datetime) -> list[Booking]:
        """Cancel every pending hold whose expires_at has passed; return them."""
        cancelled = []
        for hold in await self._booking_repo.list_expired_holds(now, limit=_BATCH):
            # changed_by None: the audit log shows the system, not a person.
            cancelled.append(await self._status.execute(hold.id, hold.company_id, BookingStatus.CANCELLED))
        return cancelled
