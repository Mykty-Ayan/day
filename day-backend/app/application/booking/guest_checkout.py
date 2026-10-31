"""The guest says they left, from their page: the host is told and the flat gets a
cleaning task if it has none open. The booking's status stays: the host checks
the guest out after looking at the flat."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from app.application.cleaning.create_task import clean_after_stay
from app.domain.booking.entities import Booking
from app.domain.booking.repositories import BookingRepository, GuestRepository
from app.domain.booking.value_objects import BookingStatus
from app.domain.cleaning.repositories import CleaningTaskRepository
from app.domain.property.repositories import PropertyRepository
from app.domain.settings.entities import DEFAULT_TIME_ZONE
from app.domain.settings.repositories import CompanySettingsRepository


class NotStayingError(Exception):
    """The booking is not a stay that has begun: nothing to leave."""


@dataclass
class GuestLeft:
    booking: Booking
    flat_name: str
    guest_name: str | None
    cleaning_created: bool


class GuestCheckoutService:
    def __init__(
        self,
        bookings: BookingRepository,
        guests: GuestRepository,
        properties: PropertyRepository,
        tasks: CleaningTaskRepository,
        company_settings: CompanySettingsRepository,
    ) -> None:
        self._bookings = bookings
        self._guests = guests
        self._properties = properties
        self._tasks = tasks
        self._settings = company_settings

    async def execute(self, code: str, now: datetime | None = None) -> GuestLeft:
        booking = await self._bookings.get_by_guest_code(code) if len(code) == 16 else None
        if booking is None:
            raise LookupError("Not found")
        company = await self._settings.get_by_company(booking.company_id)
        zone = ZoneInfo(company.time_zone if company and company.time_zone else DEFAULT_TIME_ZONE)
        today = (now or datetime.now(tz=ZoneInfo("UTC"))).astimezone(zone).date()
        if booking.status not in (BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN) or today < booking.check_in.date():
            raise NotStayingError("The stay has not begun")
        # Hosts often leave a past stay confirmed: its old link must not report a guest
        # leaving, nor book a cleaning into the flat of whoever lives there now.
        if today > booking.check_out.date():
            raise NotStayingError("The stay is over")
        prop = await self._properties.get_by_id(booking.property_id)
        guest = await self._guests.get_by_id(booking.guest_id)
        created = await clean_after_stay(
            self._tasks, self._properties, booking, today=today, notes="Гость отметил выезд на своей странице"
        )
        return GuestLeft(
            booking=booking,
            flat_name=prop.name if prop and prop.company_id == booking.company_id else "",
            guest_name=guest.name if guest and guest.company_id == booking.company_id else None,
            cleaning_created=created,
        )
