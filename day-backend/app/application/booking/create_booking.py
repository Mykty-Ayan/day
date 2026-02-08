from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from app.application.booking.price_calculator import PriceCalculatorService
from app.domain.booking.entities import Booking, BookingAuditLog, Guest
from app.domain.booking.repositories import (
    BookingAuditLogRepository,
    BookingRepository,
    GuestRepository,
)
from app.domain.booking.value_objects import BookingAuditAction, BookingSource, BookingStatus
from app.domain.property.repositories import PropertyRepository
from app.domain.property.value_objects import PropertyStatus


@dataclass
class CreateBookingInput:
    company_id: uuid.UUID
    property_id: uuid.UUID
    guest_name: str
    guest_phone: str | None = None
    guest_email: str | None = None
    check_in: date | None = None
    check_out: date | None = None
    source: BookingSource = BookingSource.DIRECT
    adults_count: int = 1
    children_count: int = 0
    gantt_color: str = "#3B82F6"
    notes: str | None = None
    changed_by: uuid.UUID | None = None


class CreateBookingService:
    def __init__(
        self,
        booking_repo: BookingRepository,
        guest_repo: GuestRepository,
        property_repo: PropertyRepository,
        audit_repo: BookingAuditLogRepository,
        price_calculator: PriceCalculatorService,
    ) -> None:
        self._booking_repo = booking_repo
        self._guest_repo = guest_repo
        self._property_repo = property_repo
        self._audit_repo = audit_repo
        self._price_calculator = price_calculator

    async def execute(self, inp: CreateBookingInput) -> Booking:
        # Validate property exists and is active
        prop = await self._property_repo.get_by_id(inp.property_id)
        if prop is None:
            raise ValueError("Property not found")
        if prop.status != PropertyStatus.ACTIVE:
            raise ValueError("Property is not active")
        if prop.company_id != inp.company_id:
            raise ValueError("Property does not belong to company")

        if inp.check_in is None or inp.check_out is None:
            raise ValueError("Check-in and check-out dates are required")
        if inp.check_out <= inp.check_in:
            raise ValueError("Check-out must be after check-in")

        # Check date overlaps
        overlapping = await self._booking_repo.get_by_property_and_dates(
            inp.property_id, inp.check_in, inp.check_out
        )
        if overlapping:
            raise ValueError("Date range overlaps with existing booking")

        # Auto-create or find guest
        guest = None
        if inp.guest_phone:
            guest = await self._guest_repo.find_by_phone(inp.company_id, inp.guest_phone)

        if guest is None:
            guest = await self._guest_repo.create(
                Guest(
                    company_id=inp.company_id,
                    name=inp.guest_name,
                    phone=inp.guest_phone,
                    email=inp.guest_email,
                )
            )

        # Calculate price
        price_breakdown = await self._price_calculator.calculate(
            inp.property_id,
            inp.check_in,
            inp.check_out,
            inp.adults_count,
            inp.children_count,
        )

        booking = await self._booking_repo.create(
            Booking(
                company_id=inp.company_id,
                property_id=inp.property_id,
                guest_id=guest.id,
                check_in=inp.check_in,
                check_out=inp.check_out,
                source=inp.source,
                status=BookingStatus.PENDING,
                gantt_color=inp.gantt_color,
                total_price=price_breakdown.total,
                calculated_price=price_breakdown.total,
                adults_count=inp.adults_count,
                children_count=inp.children_count,
                notes=inp.notes,
            )
        )

        await self._audit_repo.create(
            BookingAuditLog(
                booking_id=booking.id,
                changed_by=inp.changed_by,
                field_name="*",
                action=BookingAuditAction.CREATE,
            )
        )

        return booking
