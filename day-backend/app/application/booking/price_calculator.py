from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from app.domain.property.repositories import (
    DiscountRuleRepository,
    PricingConfigRepository,
    SeasonalPriceRepository,
)


@dataclass
class PriceBreakdown:
    nights: int
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
        check_in: date,
        check_out: date,
        adults_count: int,
        children_count: int,
    ) -> PriceBreakdown:
        pricing = await self._pricing_repo.get_by_property(property_id)
        if pricing is None:
            raise ValueError("Property has no pricing configuration")

        seasonals = await self._seasonal_repo.list_by_pricing_config(pricing.id)
        discounts = await self._discount_repo.list_by_pricing_config(pricing.id)

        nights = (check_out - check_in).days
        if nights <= 0:
            raise ValueError("Check-out must be after check-in")

        base_total = Decimal("0")
        weekend_surcharge = Decimal("0")
        seasonal_adjustment = Decimal("0")

        current = check_in
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
            base_total=base_total,
            weekend_surcharge=weekend_surcharge,
            seasonal_adjustment=seasonal_adjustment,
            extra_guest_surcharge=extra_guest_surcharge,
            discount_amount=discount_amount,
            total=max(total, Decimal("0")),
        )
