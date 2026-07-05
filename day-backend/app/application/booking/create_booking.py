from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time

from app.application.booking.price_calculator import PriceCalculatorService
from app.config import settings
from app.domain.booking.entities import Booking, BookingAuditLog, Guest
from app.domain.booking.repositories import (
    BookingAuditLogRepository,
    BookingRepository,
    GuestRepository,
)
from app.domain.booking.value_objects import (
    BookingAuditAction,
    BookingSource,
    BookingStatus,
    RentalMode,
)
from app.domain.property.repositories import PropertyRepository
from app.domain.property.value_objects import PropertyStatus


def _coerce_default_time(value: date | datetime | None, hour: int) -> datetime | None:
    """Attach a default clock time to a daily booking boundary.

    Bare dates and midnight datetimes get the configured default hour; a datetime
    that already carries a time of day is left untouched (hourly bookings).
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        if (value.hour, value.minute, value.second, value.microsecond) == (0, 0, 0, 0):
            return value.replace(hour=hour)
        return value
    return datetime.combine(value, time(hour=hour))


def apply_default_times(
    check_in: date | datetime | None,
    check_out: date | datetime | None,
    rental_mode: RentalMode,
) -> tuple[datetime | None, datetime | None]:
    """Normalize daily-booking boundaries to carry default check-in/out times."""
    if rental_mode != RentalMode.DAILY:
        return (
            check_in if check_in is None or isinstance(check_in, datetime)
            else datetime.combine(check_in, time()),
            check_out if check_out is None or isinstance(check_out, datetime)
            else datetime.combine(check_out, time()),
        )
    return (
        _coerce_default_time(check_in, settings.DEFAULT_CHECK_IN_HOUR),
        _coerce_default_time(check_out, settings.DEFAULT_CHECK_OUT_HOUR),
    )


# A property's rental_mode describes what it allows; a booking's rental_mode
# must be a subset. ``both`` allows either concrete mode, ``daily``/``hourly``
# allow only themselves.
_ALLOWED_BOOKING_MODES: dict[RentalMode, set[RentalMode]] = {
    RentalMode.DAILY: {RentalMode.DAILY},
    RentalMode.HOURLY: {RentalMode.HOURLY},
    RentalMode.BOTH: {RentalMode.DAILY, RentalMode.HOURLY},
}


def validate_rental_mode_allowed(
    booking_mode: RentalMode, property_mode: RentalMode
) -> None:
    """Ensure a booking's rental mode is permitted by the property.

    Raises ValueError when the property does not allow the requested mode
    (e.g. an hourly booking on a daily-only property).
    """
    if booking_mode not in _ALLOWED_BOOKING_MODES.get(property_mode, set()):
        raise ValueError(
            f"Rental mode '{booking_mode.value}' is not allowed for a "
            f"'{property_mode.value}' property"
        )


@dataclass
class CreateBookingInput:
    company_id: uuid.UUID
    property_id: uuid.UUID
    guest_name: str
    guest_phone: str | None = None
    guest_email: str | None = None
    check_in: date | datetime | None = None
    check_out: date | datetime | None = None
    rental_mode: RentalMode = RentalMode.DAILY
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

        # The booking's rental mode must be one the property allows.
        validate_rental_mode_allowed(inp.rental_mode, prop.rental_mode)

        if inp.check_in is None or inp.check_out is None:
            raise ValueError("Check-in and check-out dates are required")

        # Daily bookings default their clock times (14:00 / 12:00) so the stored
        # datetime is a superset of the incoming date. Hourly bookings keep their
        # explicit times, so a sub-day range is legal as long as check-out is
        # still strictly after check-in.
        check_in, check_out = apply_default_times(
            inp.check_in, inp.check_out, inp.rental_mode
        )
        if check_out <= check_in:
            raise ValueError("Check-out must be after check-in")

        # Check date overlaps
        overlapping = await self._booking_repo.get_by_property_and_dates(
            inp.property_id, check_in, check_out
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
            check_in,
            check_out,
            inp.adults_count,
            inp.children_count,
            inp.rental_mode,
        )

        booking = await self._booking_repo.create(
            Booking(
                company_id=inp.company_id,
                property_id=inp.property_id,
                guest_id=guest.id,
                check_in=check_in,
                check_out=check_out,
                rental_mode=inp.rental_mode,
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
