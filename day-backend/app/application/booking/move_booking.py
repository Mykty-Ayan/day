from __future__ import annotations

import uuid

from app.application.booking.blocks import ensure_not_blocked
from app.application.booking.create_booking import validate_rental_mode_allowed
from app.application.booking.stay_rules import overridden_rules, stay_rule_breaches
from app.domain.booking.entities import Booking, BookingAuditLog
from app.domain.booking.exceptions import BookingOverlapError, StayRulesError
from app.domain.booking.repositories import (
    BookingAuditLogRepository,
    BookingRepository,
)
from app.domain.booking.value_objects import BookingAuditAction
from app.domain.property.repositories import PropertyRepository
from app.domain.property.value_objects import PropertyStatus


class MoveBookingService:
    def __init__(
        self,
        booking_repo: BookingRepository,
        property_repo: PropertyRepository,
        audit_repo: BookingAuditLogRepository,
    ) -> None:
        self._booking_repo = booking_repo
        self._property_repo = property_repo
        self._audit_repo = audit_repo

    async def execute(
        self,
        booking_id: uuid.UUID,
        company_id: uuid.UUID,
        target_property_id: uuid.UUID,
        *,
        changed_by: uuid.UUID | None = None,
        override_rules: bool = False,
    ) -> Booking:
        booking = await self._booking_repo.get_for_update(booking_id)
        if booking is None:
            raise ValueError("Booking not found")
        if booking.company_id != company_id:
            raise ValueError("Booking does not belong to company")

        # Validate target property
        target = await self._property_repo.get_by_id(target_property_id)
        if target is None:
            raise ValueError("Target property not found")
        if target.status != PropertyStatus.ACTIVE:
            raise ValueError("Target property is not active")
        if target.company_id != company_id:
            raise ValueError("Target property does not belong to company")

        # The booking's rental mode must be one the target property allows.
        validate_rental_mode_allowed(booking.rental_mode, target.rental_mode)

        # Check overlaps on target property
        overlapping = await self._booking_repo.get_by_property_and_dates(
            target_property_id, booking.check_in, booking.check_out,
            exclude_id=booking.id,
        )
        if overlapping:
            raise BookingOverlapError("Date range overlaps with existing booking on target property")
        await ensure_not_blocked(
            self._booking_repo, target, booking.check_in, booking.check_out, booking.source.value
        )
        # The target flat's rules; the dates stay, so no lead time.
        breaches = await stay_rule_breaches(
            target,
            target_property_id,
            booking.check_in,
            booking.check_out,
            booking.rental_mode,
            company_id=company_id,
            booking_repo=self._booking_repo,
            settings_repo=None,
            exclude_id=booking.id,
            with_lead_time=False,
        )
        if breaches and not override_rules:
            raise StayRulesError(breaches)
        # The target is free on these dates, so an OTA overbooking is resolved.
        booking.overbooking = False

        old_property_id = booking.property_id
        booking.property_id = target_property_id
        updated = await self._booking_repo.update(booking)

        await self._audit_repo.create(
            BookingAuditLog(
                booking_id=updated.id,
                changed_by=changed_by,
                field_name="property_id",
                old_value=str(old_property_id),
                new_value=str(target_property_id),
                action=BookingAuditAction.MOVE,
            )
        )
        if breaches:
            await self._audit_repo.create(
                BookingAuditLog(
                    booking_id=updated.id,
                    changed_by=changed_by,
                    field_name="stay_rules_overridden",
                    new_value=overridden_rules(breaches),
                    action=BookingAuditAction.MOVE,
                )
            )

        return updated
