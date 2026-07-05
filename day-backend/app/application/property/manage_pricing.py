from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal

from app.domain.property.entities import DiscountRule, PricingConfig, SeasonalPrice
from app.domain.property.repositories import (
    DiscountRuleRepository,
    PricingConfigRepository,
    PropertyRepository,
    SeasonalPriceRepository,
)


@dataclass
class PricingConfigInput:
    base_price: Decimal
    hourly_price: Decimal = Decimal("0")
    weekend_markup: Decimal = Decimal("0")
    default_deposit: Decimal = Decimal("0")
    extra_adult_price: Decimal = Decimal("0")
    extra_child_price: Decimal = Decimal("0")
    base_guests: int = 1


class ManagePricingService:
    def __init__(
        self,
        property_repo: PropertyRepository,
        pricing_repo: PricingConfigRepository,
        seasonal_repo: SeasonalPriceRepository,
        discount_repo: DiscountRuleRepository,
    ) -> None:
        self._property_repo = property_repo
        self._pricing_repo = pricing_repo
        self._seasonal_repo = seasonal_repo
        self._discount_repo = discount_repo

    async def _check_property(
        self, property_id: uuid.UUID, company_id: uuid.UUID
    ) -> None:
        prop = await self._property_repo.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")

    async def upsert_pricing(
        self,
        property_id: uuid.UUID,
        company_id: uuid.UUID,
        inp: PricingConfigInput,
    ) -> PricingConfig:
        await self._check_property(property_id, company_id)
        existing = await self._pricing_repo.get_by_property(property_id)
        if existing:
            existing.base_price = inp.base_price
            existing.hourly_price = inp.hourly_price
            existing.weekend_markup = inp.weekend_markup
            existing.default_deposit = inp.default_deposit
            existing.extra_adult_price = inp.extra_adult_price
            existing.extra_child_price = inp.extra_child_price
            existing.base_guests = inp.base_guests
            return await self._pricing_repo.update(existing)
        config = PricingConfig(
            property_id=property_id,
            base_price=inp.base_price,
            hourly_price=inp.hourly_price,
            weekend_markup=inp.weekend_markup,
            default_deposit=inp.default_deposit,
            extra_adult_price=inp.extra_adult_price,
            extra_child_price=inp.extra_child_price,
            base_guests=inp.base_guests,
        )
        return await self._pricing_repo.save(config)

    async def get_pricing(
        self, property_id: uuid.UUID, company_id: uuid.UUID
    ) -> PricingConfig | None:
        await self._check_property(property_id, company_id)
        return await self._pricing_repo.get_by_property(property_id)

    # --- Seasonal prices ---

    async def add_seasonal_price(
        self,
        property_id: uuid.UUID,
        company_id: uuid.UUID,
        seasonal: SeasonalPrice,
    ) -> SeasonalPrice:
        await self._check_property(property_id, company_id)
        pricing = await self._pricing_repo.get_by_property(property_id)
        if pricing is None:
            raise ValueError("Pricing config not found. Create pricing first.")
        seasonal.pricing_config_id = pricing.id
        return await self._seasonal_repo.save(seasonal)

    async def delete_seasonal_price(
        self,
        property_id: uuid.UUID,
        company_id: uuid.UUID,
        price_id: uuid.UUID,
    ) -> None:
        await self._check_property(property_id, company_id)
        await self._seasonal_repo.delete(price_id)

    async def list_seasonal_prices(
        self, property_id: uuid.UUID, company_id: uuid.UUID
    ) -> list[SeasonalPrice]:
        await self._check_property(property_id, company_id)
        pricing = await self._pricing_repo.get_by_property(property_id)
        if pricing is None:
            return []
        return await self._seasonal_repo.list_by_pricing_config(pricing.id)

    # --- Discount rules ---

    async def add_discount_rule(
        self,
        property_id: uuid.UUID,
        company_id: uuid.UUID,
        rule: DiscountRule,
    ) -> DiscountRule:
        await self._check_property(property_id, company_id)
        pricing = await self._pricing_repo.get_by_property(property_id)
        if pricing is None:
            raise ValueError("Pricing config not found. Create pricing first.")
        rule.pricing_config_id = pricing.id
        return await self._discount_repo.save(rule)

    async def delete_discount_rule(
        self,
        property_id: uuid.UUID,
        company_id: uuid.UUID,
        rule_id: uuid.UUID,
    ) -> None:
        await self._check_property(property_id, company_id)
        await self._discount_repo.delete(rule_id)

    async def list_discount_rules(
        self, property_id: uuid.UUID, company_id: uuid.UUID
    ) -> list[DiscountRule]:
        await self._check_property(property_id, company_id)
        pricing = await self._pricing_repo.get_by_property(property_id)
        if pricing is None:
            return []
        return await self._discount_repo.list_by_pricing_config(pricing.id)
