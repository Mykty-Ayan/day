from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.property.entities import (
    Amenity,
    DiscountRule,
    PricingConfig,
    Property,
    PropertyAuditLog,
    PropertyPhoto,
    SeasonalPrice,
)
from app.domain.property.repositories import (
    AmenityRepository,
    DiscountRuleRepository,
    PricingConfigRepository,
    PropertyAuditLogRepository,
    PropertyPhotoRepository,
    PropertyRepository,
    SeasonalPriceRepository,
)


@dataclass
class PropertyDetail:
    property: Property
    photos: list[PropertyPhoto]
    amenities: list[Amenity]
    pricing: PricingConfig | None
    seasonal_prices: list[SeasonalPrice]
    discount_rules: list[DiscountRule]
    audit_logs: list[PropertyAuditLog]


class GetPropertyService:
    def __init__(
        self,
        property_repo: PropertyRepository,
        photo_repo: PropertyPhotoRepository,
        amenity_repo: AmenityRepository,
        pricing_repo: PricingConfigRepository,
        seasonal_repo: SeasonalPriceRepository,
        discount_repo: DiscountRuleRepository,
        audit_repo: PropertyAuditLogRepository,
    ) -> None:
        self._property_repo = property_repo
        self._photo_repo = photo_repo
        self._amenity_repo = amenity_repo
        self._pricing_repo = pricing_repo
        self._seasonal_repo = seasonal_repo
        self._discount_repo = discount_repo
        self._audit_repo = audit_repo

    async def execute(
        self, property_id: uuid.UUID, company_id: uuid.UUID
    ) -> PropertyDetail:
        prop = await self._property_repo.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")

        photos = await self._photo_repo.list_by_property(property_id)
        amenities = await self._amenity_repo.get_property_amenities(property_id)
        pricing = await self._pricing_repo.get_by_property(property_id)

        seasonal_prices: list[SeasonalPrice] = []
        discount_rules: list[DiscountRule] = []
        if pricing:
            seasonal_prices = await self._seasonal_repo.list_by_pricing_config(pricing.id)
            discount_rules = await self._discount_repo.list_by_pricing_config(pricing.id)

        audit_logs = await self._audit_repo.list_by_property(property_id, limit=20)

        return PropertyDetail(
            property=prop,
            photos=photos,
            amenities=amenities,
            pricing=pricing,
            seasonal_prices=seasonal_prices,
            discount_rules=discount_rules,
            audit_logs=audit_logs,
        )
