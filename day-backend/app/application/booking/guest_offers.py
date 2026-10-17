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
from datetime import date, timedelta
from decimal import Decimal

from app.application.booking.price_calculator import PriceCalculatorService
from app.application.property.public_stay import taken_nights
from app.domain.booking.entities import GuestOffer
from app.domain.booking.repositories import BookingRepository, GuestOfferRepository
from app.domain.booking.value_objects import RentalMode
from app.domain.property.entities import Property
from app.domain.property.repositories import PropertyPhotoRepository, PropertyRepository
from app.domain.property.value_objects import FactAudience, PropertyStatus

_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
MAX_FLATS = 10


class OfferExpiredError(ValueError):
    """The link's check-in day has passed. The HTTP layer answers 410."""


def mask_phone(phone: str) -> str:
    """+7 701 ••• •• 78: enough for the guest to know the number, nothing for anyone else."""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits[0] in "78":
        return f"+7 {digits[1:4]} ••• •• {digits[-2:]}"
    return "•" * len(digits) if len(digits) < 6 else f"{digits[:3]} ••• {digits[-2:]}"


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
        check_in: date,
        check_out: date,
        guests: int,
        property_ids: list[uuid.UUID],
        created_by: uuid.UUID | None = None,
    ) -> GuestOffer:
        if not 1 <= len(property_ids) <= MAX_FLATS:
            raise ValueError(f"An offer holds 1 to {MAX_FLATS} flats")
        if check_out <= check_in:
            raise ValueError("check_out must be after check_in")
        for property_id in property_ids:
            prop = await self._properties.get_by_id(property_id)
            if prop is None or prop.company_id != company_id or prop.status != PropertyStatus.ACTIVE:
                raise ValueError("Property not found")
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
        photos = sorted(
            (p for p in await self._photos.list_by_property(prop.id) if p.audience == FactAudience.PUBLIC),
            key=lambda p: (not p.is_cover, p.sort_order),
        )
        try:
            total = (
                await self._prices.calculate(
                    prop.id, offer.check_in, offer.check_out, offer.guests, 0, RentalMode.DAILY
                )
            ).total
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
