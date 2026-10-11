"""An apartment's knowledge base: short facts a guest may ask about."""

from __future__ import annotations

import uuid

from app.domain.property.entities import PropertyFact
from app.domain.property.repositories import PropertyFactRepository, PropertyRepository
from app.domain.property.value_objects import FactAudience, FactSource

# Enough for any flat; a bound keeps a looping integration from flooding the card.
MAX_FACTS_PER_PROPERTY = 100


class ManageFactsService:
    def __init__(self, property_repo: PropertyRepository, fact_repo: PropertyFactRepository) -> None:
        self._property_repo = property_repo
        self._fact_repo = fact_repo

    async def _check_property(self, property_id: uuid.UUID, company_id: uuid.UUID) -> None:
        prop = await self._property_repo.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")

    async def list(self, property_id: uuid.UUID, company_id: uuid.UUID) -> list[PropertyFact]:
        await self._check_property(property_id, company_id)
        return await self._fact_repo.list_by_property(property_id)

    async def add(
        self,
        property_id: uuid.UUID,
        company_id: uuid.UUID,
        text: str,
        audience: FactAudience = FactAudience.GUEST,
        *,
        source: FactSource = FactSource.USER,
    ) -> tuple[PropertyFact, bool]:
        """The fact, and whether it is new. The same text again returns the stored fact."""
        await self._check_property(property_id, company_id)
        text = text.strip()
        if not text:
            raise ValueError("A fact needs text")

        existing = await self._fact_repo.find_by_text(property_id, text)
        if existing is not None:
            return existing, False
        if len(await self._fact_repo.list_by_property(property_id)) >= MAX_FACTS_PER_PROPERTY:
            raise ValueError(f"An apartment holds at most {MAX_FACTS_PER_PROPERTY} facts")

        fact = await self._fact_repo.create(
            PropertyFact(company_id=company_id, property_id=property_id, text=text, audience=audience, source=source)
        )
        return fact, True

    async def delete(self, property_id: uuid.UUID, company_id: uuid.UUID, fact_id: uuid.UUID) -> None:
        await self._check_property(property_id, company_id)
        fact = await self._fact_repo.get_by_id(fact_id)
        if fact is None or fact.property_id != property_id:
            raise ValueError("Fact not found")
        await self._fact_repo.delete(fact_id)
