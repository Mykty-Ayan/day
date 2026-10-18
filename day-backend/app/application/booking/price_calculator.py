from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.domain.booking.value_objects import RentalMode
from app.domain.property.entities import PricingConfig
from app.domain.property.repositories import (
    DayPriceRepository,
    DiscountRuleRepository,
    PricingConfigRepository,
    SeasonalPriceRepository,
)


@dataclass
class PriceBreakdown:
    nights: int
    units: int
    unit_label: str
    base_total: Decimal
    weekend_surcharge: Decimal
    seasonal_adjustment: Decimal
    extra_guest_surcharge: Decimal
    discount_amount: Decimal
    total: Decimal


@dataclass(frozen=True)
class NightRate:
    date: date
    price: Decimal
    # The weekend markup inside price, and whether the price was set on the calendar.
    weekend: Decimal = Decimal("0")
    from_calendar: bool = False


def nightly_rates(
    pricing: PricingConfig, seasonals: list, calendar: dict[date, Decimal], first: date, nights: int
) -> list[NightRate]:
    """Each night's price, as a booking pays it before guests and discounts: a price
    set on the calendar for that night; else the season's or the base, plus the
    weekend markup on Friday and Saturday nights. The booking total and the guest's
    calendar both count from here."""
    rates = []
    for offset in range(nights):
        night = first + timedelta(days=offset)
        if night in calendar:
            rates.append(NightRate(night, calendar[night], from_calendar=True))
            continue
        season = next(
            (s for s in seasonals if s.start_date and s.end_date and s.start_date <= night <= s.end_date), None
        )
        price = season.price_per_night if season else pricing.base_price
        weekend = pricing.weekend_markup if night.weekday() in (4, 5) and pricing.weekend_markup > 0 else Decimal("0")
        rates.append(NightRate(night, price + weekend, weekend))
    return rates


class PriceCalculatorService:
    def __init__(
        self,
        pricing_repo: PricingConfigRepository,
        seasonal_repo: SeasonalPriceRepository,
        discount_repo: DiscountRuleRepository,
        day_price_repo: DayPriceRepository,
    ) -> None:
        self._pricing_repo = pricing_repo
        self._seasonal_repo = seasonal_repo
        self._discount_repo = discount_repo
        self._day_price_repo = day_price_repo

    async def calculate(
        self,
        property_id: uuid.UUID,
        check_in: date | datetime,
        check_out: date | datetime,
        adults_count: int,
        children_count: int,
        rental_mode: RentalMode = RentalMode.DAILY,
    ) -> PriceBreakdown:
        pricing = await self._pricing_repo.get_by_property(property_id)
        if pricing is None:
            raise ValueError("Property has no pricing configuration")

        if rental_mode == RentalMode.HOURLY:
            return self._calculate_hourly(pricing, check_in, check_out)

        return await self._calculate_daily(
            pricing, check_in, check_out, adults_count, children_count
        )

    def _calculate_hourly(
        self,
        pricing: PricingConfig,
        check_in: date | datetime,
        check_out: date | datetime,
    ) -> PriceBreakdown:
        # Hourly billing is deliberately simple: ceil(hours) * hourly_price, with
        # no weekend / seasonal / discount / extra-guest modifiers.
        hours = math.ceil((check_out - check_in).total_seconds() / 3600)
        if hours <= 0:
            raise ValueError("Check-out must be after check-in")

        base_total = pricing.hourly_price * hours

        return PriceBreakdown(
            nights=0,
            units=hours,
            unit_label="hours",
            base_total=base_total,
            weekend_surcharge=Decimal("0"),
            seasonal_adjustment=Decimal("0"),
            extra_guest_surcharge=Decimal("0"),
            discount_amount=Decimal("0"),
            total=base_total,
        )

    async def _calculate_daily(
        self,
        pricing: PricingConfig,
        check_in: date | datetime,
        check_out: date | datetime,
        adults_count: int,
        children_count: int,
    ) -> PriceBreakdown:
        seasonals = await self._seasonal_repo.list_by_pricing_config(pricing.id)
        discounts = await self._discount_repo.list_by_pricing_config(pricing.id)

        # Daily pricing is whole-night based: derive nights from the date part so
        # datetime-backed bookings (with default 14:00/12:00 times) yield the same
        # per-night totals as bare-date bookings did.
        check_in_date = check_in.date() if isinstance(check_in, datetime) else check_in
        check_out_date = check_out.date() if isinstance(check_out, datetime) else check_out

        nights = (check_out_date - check_in_date).days
        if nights <= 0:
            raise ValueError("Check-out must be after check-in")

        # Prices set on the calendar for single nights, as Airbnb's custom price.
        calendar = {
            p.date: p.price
            for p in await self._day_price_repo.list_for_property(pricing.property_id, check_in_date, check_out_date)
        }

        base_total = Decimal("0")
        weekend_surcharge = Decimal("0")
        seasonal_adjustment = Decimal("0")
        calendar_total = Decimal("0")

        # The breakdown splits each night's price: the base, the weekend markup, and
        # the rest (a season, or a calendar price, which replaces both) as an adjustment.
        for rate in nightly_rates(pricing, seasonals, calendar, check_in_date, nights):
            base_total += pricing.base_price
            weekend_surcharge += rate.weekend
            seasonal_adjustment += rate.price - pricing.base_price - rate.weekend
            if rate.from_calendar:
                calendar_total += rate.price

        # Extra guest surcharge
        extra_guest_surcharge = Decimal("0")
        extra_adults = max(0, adults_count - pricing.base_guests)
        extra_guest_surcharge += pricing.extra_adult_price * extra_adults * nights
        extra_guest_surcharge += pricing.extra_child_price * children_count * nights

        # Subtotal before discount
        subtotal = base_total + weekend_surcharge + seasonal_adjustment + extra_guest_surcharge

        # Find best applicable discount
        discount_amount = Decimal("0")
        applicable_discounts = sorted(
            [d for d in discounts if d.min_nights <= nights],
            key=lambda d: d.min_nights,
            reverse=True,
        )
        if applicable_discounts:
            best = applicable_discounts[0]
            if best.discount_percent > 0:
                # As on Airbnb, a calendar price is not cut by a long-stay discount.
                discount_amount = (subtotal - calendar_total) * best.discount_percent / 100
            if best.discount_fixed > 0:
                discount_amount = max(discount_amount, min(best.discount_fixed, subtotal - calendar_total))

        total = subtotal - discount_amount

        return PriceBreakdown(
            nights=nights,
            units=nights,
            unit_label="nights",
            base_total=base_total,
            weekend_surcharge=weekend_surcharge,
            seasonal_adjustment=seasonal_adjustment,
            extra_guest_surcharge=extra_guest_surcharge,
            discount_amount=discount_amount,
            total=max(total, Decimal("0")),
        )
