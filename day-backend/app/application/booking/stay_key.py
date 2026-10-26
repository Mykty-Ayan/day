"""A guest opens their booking from the flat's page: an NFC tag or a QR code in the
flat links to /s/<code>?nfc (or ?qr), and the page offers "I am staying here".

Every guest who ever stayed has that link, so it opens nothing by itself: the guest
gives the last 4 digits of the phone on the booking, and only a stay going on now
answers with its page's code (/g/<code>). The caller brakes wrong digits per flat.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.domain.booking.entities import Booking
from app.domain.booking.repositories import BookingRepository, GuestRepository
from app.domain.booking.value_objects import BookingStatus
from app.domain.property.entities import Property
from app.domain.property.repositories import PropertyRepository
from app.domain.property.value_objects import PropertyStatus
from app.domain.settings.entities import DEFAULT_TIME_ZONE
from app.domain.settings.repositories import CompanySettingsRepository

_LIVE = {BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN}
# A guest at the door a little before check-in time taps the tag too.
_EARLY = timedelta(hours=3)


class NobodyStayingError(Exception):
    """No stay of the flat is going on now."""


class WrongDigitsError(Exception):
    """The digits match the phone of no stay going on now."""


@dataclass
class StayHere:
    staying: bool
    # Some stay going on now has a phone to check the digits against.
    by_phone: bool
    # The booking code this device remembers is one of the stays going on now.
    mine: bool


def _last4(phone: str | None) -> str | None:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-4:] if len(digits) >= 4 else None


class StayKeyService:
    def __init__(
        self,
        properties: PropertyRepository,
        bookings: BookingRepository,
        guests: GuestRepository,
        company_settings: CompanySettingsRepository,
    ) -> None:
        self._properties = properties
        self._bookings = bookings
        self._guests = guests
        self._settings = company_settings

    async def _live(self, code: str, now: datetime | None) -> tuple[Property, list[Booking]]:
        """The flat behind the code and its stays going on now; ValueError for no flat on sale."""
        prop = await self._properties.get_by_public_code(code)
        if prop is None or prop.status != PropertyStatus.ACTIVE:
            raise ValueError("Not found")
        company = await self._settings.get_by_company(prop.company_id)
        zone = ZoneInfo(company.time_zone if company and company.time_zone else DEFAULT_TIME_ZONE)
        # Check-in and check-out are the company's local times, as everywhere in Day.
        local_now = (now or datetime.now(tz=ZoneInfo("UTC"))).astimezone(zone).replace(tzinfo=None)
        today = local_now.date()
        around = await self._bookings.list_by_property_date_range(
            prop.id, today - timedelta(days=1), today + timedelta(days=2), company_id=prop.company_id
        )
        # By the clock, not by the status alone: hosts often leave a past stay confirmed.
        live = [
            b for b in around
            if b.company_id == prop.company_id and b.status in _LIVE and b.check_in - _EARLY <= local_now < b.check_out
        ]
        return prop, live

    async def _phones(self, prop: Property, live: list[Booking]) -> list[tuple[Booking, str]]:
        found = []
        for b in live:
            guest = await self._guests.get_by_id(b.guest_id)
            last4 = _last4(guest.phone) if guest and guest.company_id == prop.company_id else None
            if last4:
                found.append((b, last4))
        return found

    async def here(self, code: str, remembered: str | None, now: datetime | None = None) -> StayHere:
        prop, live = await self._live(code, now)
        return StayHere(
            staying=bool(live),
            by_phone=bool(await self._phones(prop, live)),
            mine=remembered is not None and any(b.guest_code == remembered for b in live),
        )

    async def unlock(self, code: str, digits: str, now: datetime | None = None) -> str:
        """The page code of the stay going on now whose guest's phone ends in the digits."""
        prop, live = await self._live(code, now)
        if not live:
            raise NobodyStayingError("Nobody is staying now")
        for booking, last4 in await self._phones(prop, live):
            if last4 == digits:
                return booking.guest_code
        raise WrongDigitsError("Wrong digits")
