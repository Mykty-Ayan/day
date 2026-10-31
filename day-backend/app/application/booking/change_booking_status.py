from __future__ import annotations

import uuid

from app.application.booking.stay_rules import company_now
from app.application.cleaning.create_task import clean_after_stay
from app.domain.booking.entities import Booking, BookingAuditLog
from app.domain.booking.repositories import (
    BookingAuditLogRepository,
    BookingRepository,
)
from app.domain.booking.value_objects import BookingAuditAction, BookingStatus
from app.domain.cleaning.repositories import CleaningTaskRepository
from app.domain.property.repositories import PropertyRepository
from app.domain.settings.repositories import CompanySettingsRepository


class ChangeBookingStatusService:
    def __init__(
        self,
        booking_repo: BookingRepository,
        audit_repo: BookingAuditLogRepository,
        *,
        task_repo: CleaningTaskRepository | None = None,
        property_repo: PropertyRepository | None = None,
        settings_repo: CompanySettingsRepository | None = None,
    ) -> None:
        self._booking_repo = booking_repo
        self._audit_repo = audit_repo
        self._task_repo = task_repo
        self._property_repo = property_repo
        self._settings_repo = settings_repo

    async def execute(
        self,
        booking_id: uuid.UUID,
        company_id: uuid.UUID,
        target_status: BookingStatus,
        *,
        changed_by: uuid.UUID | None = None,
    ) -> Booking:
        booking = await self._booking_repo.get_for_update(booking_id)
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

        if target_status == BookingStatus.CHECKED_OUT and self._task_repo and self._property_repo:
            today = (await company_now(self._settings_repo, company_id)).date()
            # A stay closed days late was cleaned long ago: the task would only be noise.
            if updated.check_out.date() >= today:
                await clean_after_stay(
                    self._task_repo, self._property_repo, updated, today=today, notes="Гость выехал"
                )

        return updated
