"""The company's rules for guests: what holds in every flat, kept once."""

from __future__ import annotations

import uuid

from app.domain.property.entities import CompanyFact
from app.domain.property.repositories import CompanyFactRepository
from app.domain.property.value_objects import FactAudience, FactSource

# Rules for guests, not a manual: a bound keeps a looping integration from flooding every card.
MAX_COMPANY_FACTS = 50


class ManageCompanyFactsService:
    def __init__(self, facts: CompanyFactRepository) -> None:
        self._facts = facts

    async def list(self, company_id: uuid.UUID) -> list[CompanyFact]:
        return await self._facts.list_by_company(company_id)

    async def add(
        self,
        company_id: uuid.UUID,
        text: str,
        audience: FactAudience = FactAudience.PUBLIC,
        *,
        source: FactSource = FactSource.USER,
    ) -> tuple[CompanyFact, bool]:
        """The fact, and whether it is new. The same text again returns the stored fact."""
        text = text.strip()
        if not text:
            raise ValueError("A fact needs text")
        existing = await self._facts.find_by_text(company_id, text)
        if existing is not None:
            return existing, False
        if len(await self._facts.list_by_company(company_id)) >= MAX_COMPANY_FACTS:
            raise ValueError(f"A company holds at most {MAX_COMPANY_FACTS} rules")
        fact = await self._facts.create(CompanyFact(company_id=company_id, text=text, audience=audience, source=source))
        return fact, True

    async def delete(self, company_id: uuid.UUID, fact_id: uuid.UUID) -> None:
        if await self._facts.get(company_id, fact_id) is None:
            raise LookupError("Fact not found")
        await self._facts.delete(company_id, fact_id)
