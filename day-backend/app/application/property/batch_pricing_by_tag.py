from __future__ import annotations

import uuid
from decimal import Decimal

from app.domain.property.entities import PricingConfig
from app.domain.property.repositories import PricingConfigRepository, PropertyTagRepository


class BatchUpdatePricingByTagService:
    def __init__(
        self,
        tag_repo: PropertyTagRepository,
        pricing_repo: PricingConfigRepository,
    ) -> None:
        self._tag_repo = tag_repo
        self._pricing_repo = pricing_repo

    async def execute(
        self,
        tag_id: uuid.UUID,
        company_id: uuid.UUID,
        base_price: Decimal,
    ) -> int:
        """Update base_price for all properties with the given tag. Returns count of updated."""
        tag = await self._tag_repo.get_by_id(tag_id)
        if tag is None or tag.company_id != company_id:
            raise ValueError("Tag not found")

        property_ids = await self._tag_repo.get_property_ids_by_tag(tag_id)
        updated = 0
        for pid in property_ids:
            pricing = await self._pricing_repo.get_by_property(pid)
            if pricing:
                pricing.base_price = base_price
                await self._pricing_repo.update(pricing)
            else:
                await self._pricing_repo.save(
                    PricingConfig(
                        id=uuid.uuid4(),
                        property_id=pid,
                        base_price=base_price,
                    )
                )
            updated += 1
        return updated
