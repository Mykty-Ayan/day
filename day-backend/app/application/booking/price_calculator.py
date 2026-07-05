from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.domain.booking.value_objects import RentalMode
from app.domain.property.entities import PricingConfig
from app.domain.property.repositories import (
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


class PriceCalculatorService:
    def __init__(
        self,
        pricing_repo: PricingConfigRepository,
        seasonal_repo: SeasonalPriceRepository,
        discount_repo: DiscountRuleRepository,
    ) -> None:
        self._pricing_repo = pricing_repo
        self._seasonal_repo = seasonal_repo
        self._discount_repo = discount_repo

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

        base_total = Decimal("0")
        weekend_surcharge = Decimal("0")
        seasonal_adjustment = Decimal("0")

        current = check_in_date
        for _ in range(nights):
            # Check if any seasonal price applies for this night
            night_price = pricing.base_price
            is_seasonal = False
            for s in seasonals:
                if s.start_date and s.end_date and s.start_date <= current <= s.end_date:
                    night_price = s.price_per_night
                    is_seasonal = True
                    break

            if is_seasonal:
                seasonal_adjustment += night_price - pricing.base_price
                base_total += pricing.base_price
            else:
                base_total += night_price

            # Weekend markup (Friday=4, Saturday=5)
            if current.weekday() in (4, 5) and pricing.weekend_markup > 0:
                weekend_surcharge += pricing.weekend_markup

            current += timedelta(days=1)

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
                discount_amount = subtotal * best.discount_percent / 100
            if best.discount_fixed > 0:
                discount_amount = max(discount_amount, best.discount_fixed)

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
