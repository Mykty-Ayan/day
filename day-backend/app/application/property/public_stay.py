"""A flat's page for guests: what it is, what a night costs and which nights are free.

Opened by a link with no sign-in, so only what a listing shows: no internal name
(it often holds the flat's number), address, entrance, codes, Wi-Fi, check-in
instructions or check-in photos. Only an active flat has a page.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from app.application.booking.ical_export import blocked_nights
from app.application.booking.price_calculator import NightRate, has_tariffs, nightly_rates
from app.config import settings
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

# A cancelled booking and one that left early (completed) hold no night, as a new
# booking finds them.
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
    # The ways the flat is let and priced: by the night, by the hour.
    by_night: bool = False
    by_hour: bool = False


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
        by_night = bool(pricing) and prop.rental_mode != RentalMode.HOURLY and pricing.base_price > 0
        by_hour = (
            bool(pricing)
            and prop.rental_mode != RentalMode.DAILY
            and (pricing.hourly_price > 0 or has_tariffs(pricing))
        )
        return PublicStay(
            property=prop,
            photos=[p.url for p in photos],
            amenities=await self._amenities.get_property_amenities(prop.id),
            pricing=pricing,
            nights=await self._nights(prop, pricing, date_from, date_to) if by_night else [],
            by_night=by_night,
            by_hour=by_hour,
        )

    async def _nights(
        self, prop: Property, pricing: PricingConfig, date_from: date, date_to: date
    ) -> list[PublicNight]:
        count = (date_to - date_from).days
        seasonals = await self._seasonal.list_by_pricing_config(pricing.id)
        calendar = {p.date: p.price for p in await self._day_prices.list_for_property(prop.id, date_from, date_to)}
        rates: list[NightRate] = nightly_rates(pricing, seasonals, calendar, date_from, count)
        taken = await taken_nights(self._bookings, prop, date_from, date_to)
        return [PublicNight(rate.date, rate.price, rate.date not in taken) for rate in rates]


async def taken_nights(bookings: BookingRepository, prop: Property, date_from: date, date_to: date) -> set[date]:
    """The flat's taken nights around [date_from, date_to), by its own hours, as a booking
    finds them and as the iCal feed tells the platforms: night D runs from D at check-in
    time to D+1 at check-out time, and an hourly booking holds the night it falls in."""
    start = datetime.combine(date_from - timedelta(days=1), time.min)
    end = datetime.combine(date_to + timedelta(days=1), time.min)
    stays = [
        booking
        for booking in await bookings.list_by_property_date_range(prop.id, start, end, company_id=prop.company_id)
        if booking.status not in _FREES_NIGHTS
    ]
    blocks = await bookings.list_blocks(prop.id, date_from - timedelta(days=1), date_to + timedelta(days=1))
    taken: set[date] = set()
    for first, last in blocked_nights(
        stays,
        settings.DEFAULT_CHECK_IN_HOUR if prop.check_in_hour is None else prop.check_in_hour,
        settings.DEFAULT_CHECK_OUT_HOUR if prop.check_out_hour is None else prop.check_out_hour,
        blocks=blocks,
    ):
        taken.update(_days(first, last))
    return taken


def _days(first: date, end: date) -> list[date]:
    return [date.fromordinal(n) for n in range(first.toordinal(), end.toordinal())]
