from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from decimal import Decimal

from app.application.booking.price_calculator import PriceCalculatorService
from app.domain.booking.entities import Booking, BookingAuditLog
from app.domain.booking.repositories import (
    BookingAuditLogRepository,
    BookingRepository,
)
from app.domain.booking.value_objects import BookingAuditAction, BookingSource

_UNSET = object()


@dataclass
class UpdateBookingInput:
    booking_id: uuid.UUID
    company_id: uuid.UUID
    changed_by: uuid.UUID | None = None
    check_in: object = field(default=_UNSET)
    check_out: object = field(default=_UNSET)
    source: object = field(default=_UNSET)
    gantt_color: object = field(default=_UNSET)
    gantt_icon: object = field(default=_UNSET)
    adults_count: object = field(default=_UNSET)
    children_count: object = field(default=_UNSET)
    total_price: object = field(default=_UNSET)
    notes: object = field(default=_UNSET)


class UpdateBookingService:
    def __init__(
        self,
        booking_repo: BookingRepository,
        audit_repo: BookingAuditLogRepository,
        price_calculator: PriceCalculatorService,
    ) -> None:
        self._booking_repo = booking_repo
        self._audit_repo = audit_repo
        self._price_calculator = price_calculator

    async def execute(self, inp: UpdateBookingInput) -> Booking:
        booking = await self._booking_repo.get_by_id(inp.booking_id)
        if booking is None:
            raise ValueError("Booking not found")
        if booking.company_id != inp.company_id:
            raise ValueError("Booking does not belong to company")

        changes: list[tuple[str, str | None, str | None]] = []

        def _track(field_name: str, old_val, new_val):
            if old_val != new_val:
                changes.append((field_name, str(old_val), str(new_val)))

        dates_changed = False

        if inp.check_in is not _UNSET:
            _track("check_in", booking.check_in, inp.check_in)
            booking.check_in = inp.check_in  # type: ignore[assignment]
            dates_changed = True
        if inp.check_out is not _UNSET:
            _track("check_out", booking.check_out, inp.check_out)
            booking.check_out = inp.check_out  # type: ignore[assignment]
            dates_changed = True
        if inp.source is not _UNSET:
            _track("source", booking.source.value, inp.source)
            booking.source = BookingSource(inp.source)  # type: ignore[arg-type]
        if inp.gantt_color is not _UNSET:
            _track("gantt_color", booking.gantt_color, inp.gantt_color)
            booking.gantt_color = inp.gantt_color  # type: ignore[assignment]
        if inp.gantt_icon is not _UNSET:
            _track("gantt_icon", booking.gantt_icon, inp.gantt_icon)
            booking.gantt_icon = inp.gantt_icon  # type: ignore[assignment]
        if inp.adults_count is not _UNSET:
            _track("adults_count", booking.adults_count, inp.adults_count)
            booking.adults_count = inp.adults_count  # type: ignore[assignment]
            dates_changed = True  # recalculate price
        if inp.children_count is not _UNSET:
            _track("children_count", booking.children_count, inp.children_count)
            booking.children_count = inp.children_count  # type: ignore[assignment]
            dates_changed = True
        if inp.total_price is not _UNSET:
            _track("total_price", str(booking.total_price), str(inp.total_price))
            booking.total_price = Decimal(str(inp.total_price))
        if inp.notes is not _UNSET:
            _track("notes", booking.notes, inp.notes)
            booking.notes = inp.notes  # type: ignore[assignment]

        # Re-check overlaps if dates changed
        if dates_changed and booking.check_in and booking.check_out:
            if booking.check_out <= booking.check_in:
                raise ValueError("Check-out must be after check-in")
            overlapping = await self._booking_repo.get_by_property_and_dates(
                booking.property_id, booking.check_in, booking.check_out,
                exclude_id=booking.id,
            )
            if overlapping:
                raise ValueError("Date range overlaps with existing booking")

            # Recalculate price
            try:
                breakdown = await self._price_calculator.calculate(
                    booking.property_id,
                    booking.check_in,
                    booking.check_out,
                    booking.adults_count,
                    booking.children_count,
                )
                booking.calculated_price = breakdown.total
            except ValueError:
                pass  # No pricing config, keep existing calculated_price

        updated = await self._booking_repo.update(booking)

        for field_name, old_val, new_val in changes:
            await self._audit_repo.create(
                BookingAuditLog(
                    booking_id=updated.id,
                    changed_by=inp.changed_by,
                    field_name=field_name,
                    old_value=old_val,
                    new_value=new_val,
                    action=BookingAuditAction.UPDATE,
                )
            )

        return updated
