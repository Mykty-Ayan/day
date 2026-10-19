"""Personal links aidyn sends guests (/o/<code>): one flat or several for the
guest's dates, each with what the stay costs and whether it is still free.

The guest's name and phone stay in Day; the link holds only a random code, and
the page shows the first name and a masked phone, so a forwarded link gives away
nothing more. A link lasts until the check-in day.
"""

from __future__ import annotations

import re
import secrets
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from app.application.booking.price_calculator import PriceCalculatorService
from app.application.property.public_stay import taken_nights
from app.config import settings
from app.domain.booking.entities import GuestOffer
from app.domain.booking.repositories import BookingRepository, GuestOfferRepository
from app.domain.booking.value_objects import RentalMode
from app.domain.property.entities import Property
from app.domain.property.repositories import PropertyPhotoRepository, PropertyRepository
from app.domain.property.value_objects import FactAudience, PropertyStatus

_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
MAX_FLATS = 10
# As a flat's page: every night of the stay is priced and checked on each visit.
MAX_NIGHTS = 120
HORIZON_DAYS = 730
# An hourly stay ends within a day; longer is a night.
MAX_HOURS = 24


class OfferExpiredError(ValueError):
    """The link's check-in day has passed. The HTTP layer answers 410."""


def mask_phone(phone: str) -> str:
    """+7 701 ••• •• 78: enough for the guest to know the number, nothing for anyone
    else. A number from abroad shows its last two digits alone."""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits[0] in "78":
        return f"+7 {digits[1:4]} ••• •• {digits[-2:]}"
    return f"••• ••• •• {digits[-2:]}"


def greeting(name: str) -> str | None:
    """The first word of the guest's name, or nothing when it holds a digit: a
    contact saved under its number would show the number the mask hides."""
    words = name.split()
    if not words or any(ch.isdigit() for ch in words[0]):
        return None
    return words[0]


@dataclass
class OfferFlat:
    property: Property
    photo: str | None
    total: Decimal | None
    free: bool


@dataclass
class PublicOffer:
    offer: GuestOffer
    flats: list[OfferFlat]


class GuestOffersService:
    def __init__(
        self,
        offer_repo: GuestOfferRepository,
        property_repo: PropertyRepository,
        photo_repo: PropertyPhotoRepository,
        booking_repo: BookingRepository,
        prices: PriceCalculatorService,
        *,
        today: Callable[[], date] = date.today,
    ) -> None:
        self._offers = offer_repo
        self._properties = property_repo
        self._photos = photo_repo
        self._bookings = booking_repo
        self._prices = prices
        self._today = today

    async def create(
        self,
        company_id: uuid.UUID,
        *,
        guest_name: str,
        guest_phone: str,
        check_in: date | None = None,
        check_out: date | None = None,
        guests: int,
        property_ids: list[uuid.UUID],
        created_by: uuid.UUID | None = None,
        external_id: str | None = None,
        rental_mode: RentalMode = RentalMode.DAILY,
        starts_at: datetime | None = None,
        ends_at: datetime | None = None,
    ) -> GuestOffer:
        if not 1 <= len(property_ids) <= MAX_FLATS:
            raise ValueError(f"An offer holds 1 to {MAX_FLATS} flats")
        hourly = rental_mode == RentalMode.HOURLY
        if hourly:
            if starts_at is None or ends_at is None:
                raise ValueError("An hourly offer needs starts_at and ends_at")
            if ends_at <= starts_at:
                raise ValueError("ends_at must be after starts_at")
            if ends_at - starts_at > timedelta(hours=MAX_HOURS):
                raise ValueError(f"An hourly offer covers at most {MAX_HOURS} hours")
            check_in = starts_at.date()
            check_out = check_in + timedelta(days=1)
        elif rental_mode != RentalMode.DAILY:
            raise ValueError("An offer is by the night or by the hour")
        elif check_in is None or check_out is None:
            raise ValueError("A nightly offer needs check_in and check_out")
        if check_out <= check_in:
            raise ValueError("check_out must be after check_in")
        today, nights = self._today(), (check_out - check_in).days
        if check_in < today:
            raise ValueError("check_in is in the past")
        if check_in > today + timedelta(days=HORIZON_DAYS):
            raise ValueError(f"check_in is more than {HORIZON_DAYS} days ahead")
        if nights > MAX_NIGHTS:
            raise ValueError(f"An offer covers at most {MAX_NIGHTS} nights")
        for property_id in property_ids:
            prop = await self._properties.get_by_id(property_id)
            if prop is None or prop.company_id != company_id or prop.status != PropertyStatus.ACTIVE:
                raise ValueError("Property not found")
            if hourly:
                _check_takes_hours(prop, guests)
            else:
                _check_takes(prop, nights, guests)
        return await self._offers.add(
            GuestOffer(
                company_id=company_id,
                code="".join(secrets.choice(_ALPHABET) for _ in range(8)),
                guest_name=guest_name.strip(),
                guest_phone=guest_phone.strip(),
                check_in=check_in,
                check_out=check_out,
                guests=guests,
                property_ids=list(dict.fromkeys(property_ids)),
                created_by=created_by,
                external_id=(external_id or "").strip() or None,
                rental_mode=rental_mode,
                starts_at=starts_at if hourly else None,
                ends_at=ends_at if hourly else None,
            )
        )

    async def public(self, code: str) -> PublicOffer:
        """The guest's view: the offer's flats still on sale, with the stay's price
        and whether every night of it is still free."""
        offer = await self._offers.get_by_code(code)
        if offer is None:
            raise ValueError("Not found")
        if self._today() > offer.check_in:
            raise OfferExpiredError("Expired")
        flats = []
        for property_id in offer.property_ids:
            prop = await self._properties.get_by_id(property_id)
            if prop is None or prop.company_id != offer.company_id or prop.status != PropertyStatus.ACTIVE:
                continue
            flats.append(await self._flat(prop, offer))
        return PublicOffer(offer=offer, flats=flats)

    async def _flat(self, prop: Property, offer: GuestOffer) -> OfferFlat:
        if offer.rental_mode == RentalMode.HOURLY:
            return await self._hourly_flat(prop, offer)
        # As a flat's page: no price for a night is no sum, not 0 or the fees alone.
        photos = sorted(
            (p for p in await self._photos.list_by_property(prop.id) if p.audience == FactAudience.PUBLIC),
            key=lambda p: (not p.is_cover, p.sort_order),
        )
        try:
            breakdown = await self._prices.calculate(
                prop.id, offer.check_in, offer.check_out, offer.guests, 0, RentalMode.DAILY
            )
            total = breakdown.total if breakdown.base_total > 0 else None
        except ValueError:
            total = None  # no prices set: the page shows the flat without a sum
        taken = await taken_nights(self._bookings, prop, offer.check_in, offer.check_out)
        nights = [offer.check_in + timedelta(days=n) for n in range((offer.check_out - offer.check_in).days)]
        return OfferFlat(
            property=prop,
            photo=photos[0].url if photos else None,
            total=total,
            free=not any(night in taken for night in nights),
        )


    async def _hourly_flat(self, prop: Property, offer: GuestOffer) -> OfferFlat:
        """As a booking finds the hours: no stay over them, no closed day. The cleaning
        buffer and the lead time are the booking's to refuse, with their reason."""
        photos = sorted(
            (p for p in await self._photos.list_by_property(prop.id) if p.audience == FactAudience.PUBLIC),
            key=lambda p: (not p.is_cover, p.sort_order),
        )
        start, end = offer.starts_at, offer.ends_at
        try:
            breakdown = await self._prices.calculate(prop.id, start, end, offer.guests, 0, RentalMode.HOURLY)
            total = breakdown.total if breakdown.base_total > 0 else None
        except ValueError:
            total = None
        taken = await self._bookings.get_by_property_and_dates(prop.id, start, end)
        # A closed span runs from the check-out hour of its first day to that hour of its end day.
        hour = settings.DEFAULT_CHECK_OUT_HOUR if prop.check_out_hour is None else prop.check_out_hour
        day = timedelta(days=1)
        blocks = await self._bookings.list_blocks(prop.id, start.date() - day, end.date() + day)
        closed = [
            b
            for b in blocks
            if datetime.combine(b.start_date, time(hour)) < end and datetime.combine(b.end_date, time(hour)) > start
        ]
        return OfferFlat(
            property=prop,
            photo=photos[0].url if photos else None,
            total=total,
            free=not taken and not closed,
        )


def _check_takes_hours(prop: Property, guests: int) -> None:
    """The flat is let by the hour and takes the party."""
    if prop.rental_mode == RentalMode.DAILY:
        raise ValueError(f"{prop.name} lets by the night only")
    if prop.max_guests is not None and guests > prop.max_guests:
        raise ValueError(f"{prop.name} takes up to {prop.max_guests} guests")


def _check_takes(prop: Property, nights: int, guests: int) -> None:
    """The flat takes this stay: by the night, the party, the stay's length. A link
    to a flat the guest cannot book is a dead end; the CRM is told which and why."""
    if prop.rental_mode == RentalMode.HOURLY:
        raise ValueError(f"{prop.name} lets by the hour only")
    if prop.max_guests is not None and guests > prop.max_guests:
        raise ValueError(f"{prop.name} takes up to {prop.max_guests} guests")
    if prop.min_nights is not None and nights < prop.min_nights:
        raise ValueError(f"{prop.name} takes stays of at least {prop.min_nights} nights")
    if prop.max_nights is not None and nights > prop.max_nights:
        unit = "night" if prop.max_nights == 1 else "nights"
        raise ValueError(f"{prop.name} takes stays of at most {prop.max_nights} {unit}")
