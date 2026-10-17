"""A flat's page for guests: what it is, what a night costs and which nights are free.

Opened by a link with no sign-in, so only what a listing shows: no internal name
(it often holds the flat's number), address, entrance, codes, Wi-Fi, check-in
instructions or check-in photos. Only an active flat has a page.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal

from app.application.booking.price_calculator import NightRate, nightly_rates
from app.domain.booking.repositories import BookingRepository
from app.domain.booking.value_objects import BookingStatus, RentalMode
from app.domain.property.entities import Amenity, PricingConfig, Property
from app.domain.property.repositories import (
    AmenityRepository,
    DayPriceRepository,
    PricingConfigRepository,
    PropertyPhotoRepository,
    PropertyRepository,
    SeasonalPriceRepository,
)
from app.domain.property.value_objects import FactAudience, PropertyStatus

# Nights a stay holds, as the booking calendar counts them: a cancelled booking and
# one that left early (completed) hold none, and an hourly one takes no night.
_FREES_NIGHTS = {BookingStatus.CANCELLED, BookingStatus.COMPLETED}


@dataclass
class PublicNight:
    date: date
    price: Decimal
    free: bool


@dataclass
class PublicStay:
    property: Property
    photos: list[str]
    amenities: list[Amenity]
    pricing: PricingConfig | None
    nights: list[PublicNight]


class GetPublicStayService:
    def __init__(
        self,
        property_repo: PropertyRepository,
        photo_repo: PropertyPhotoRepository,
        amenity_repo: AmenityRepository,
        pricing_repo: PricingConfigRepository,
        seasonal_repo: SeasonalPriceRepository,
        day_price_repo: DayPriceRepository,
        booking_repo: BookingRepository,
    ) -> None:
        self._properties = property_repo
        self._photos = photo_repo
        self._amenities = amenity_repo
        self._pricing = pricing_repo
        self._seasonal = seasonal_repo
        self._day_prices = day_price_repo
        self._bookings = booking_repo

    async def execute(self, code: str, date_from: date, date_to: date) -> PublicStay:
        """The flat behind the code, with its nights in [date_from, date_to)."""
        prop = await self._properties.get_by_public_code(code)
        if prop is None or prop.status != PropertyStatus.ACTIVE:
            raise ValueError("Not found")

        photos = sorted(
            (p for p in await self._photos.list_by_property(prop.id) if p.audience == FactAudience.PUBLIC),
            key=lambda p: (not p.is_cover, p.sort_order),
        )
        pricing = await self._pricing.get_by_property(prop.id)
        return PublicStay(
            property=prop,
            photos=[p.url for p in photos],
            amenities=await self._amenities.get_property_amenities(prop.id),
            pricing=pricing,
            nights=await self._nights(prop, pricing, date_from, date_to) if pricing else [],
        )

    async def _nights(
        self, prop: Property, pricing: PricingConfig, date_from: date, date_to: date
    ) -> list[PublicNight]:
        count = (date_to - date_from).days
        seasonals = await self._seasonal.list_by_pricing_config(pricing.id)
        calendar = {p.date: p.price for p in await self._day_prices.list_for_property(prop.id, date_from, date_to)}
        rates: list[NightRate] = nightly_rates(pricing, seasonals, calendar, date_from, count)

        taken: set[date] = set()
        start, end = datetime.combine(date_from, time.min), datetime.combine(date_to, time.min)
        stays = await self._bookings.list_by_property_date_range(prop.id, start, end, company_id=prop.company_id)
        for booking in stays:
            if booking.status in _FREES_NIGHTS or booking.rental_mode == RentalMode.HOURLY:
                continue
            taken.update(_days(booking.check_in.date(), booking.check_out.date()))
        for block in await self._bookings.list_blocks(prop.id, date_from, date_to):
            taken.update(_days(block.start_date, block.end_date))
        return [PublicNight(rate.date, rate.price, rate.date not in taken) for rate in rates]


def _days(first: date, end: date) -> list[date]:
    return [date.fromordinal(n) for n in range(first.toordinal(), end.toordinal())]
