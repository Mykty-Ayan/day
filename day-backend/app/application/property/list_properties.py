from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.property.entities import Property
from app.domain.property.repositories import PropertyRepository
from app.domain.property.value_objects import PropertyStatus


@dataclass
class ListPropertiesResult:
    items: list[Property]
    total: int
    offset: int
    limit: int


class ListPropertiesService:
    def __init__(self, property_repo: PropertyRepository) -> None:
        self._property_repo = property_repo

    async def execute(
        self,
        company_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
        status: PropertyStatus | None = None,
        search: str | None = None,
    ) -> ListPropertiesResult:
        items = await self._property_repo.list_by_company(
            company_id, offset=offset, limit=limit, status=status, search=search
        )
        total = await self._property_repo.count_by_company(company_id)
        return ListPropertiesResult(
            items=items, total=total, offset=offset, limit=limit
        )
