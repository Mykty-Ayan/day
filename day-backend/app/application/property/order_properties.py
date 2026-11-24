"""The order of a company's flats on the chessboard, or back to the order by name."""

from __future__ import annotations

import uuid

from app.domain.property.repositories import PropertyRepository


class OrderPropertiesService:
    def __init__(self, property_repo: PropertyRepository) -> None:
        self._property_repo = property_repo

    async def execute(self, company_id: uuid.UUID, property_ids: list[uuid.UUID]) -> None:
        """Put the flats in the order given; an empty list puts them all back in order by name.

        A flat left out (one not on the chessboard: new, archived) goes after the
        ordered ones, by its name. A flat of another company is not found.
        """
        flats = []
        offset = 0
        while True:
            batch = await self._property_repo.list_by_company(company_id, offset=offset, limit=200)
            flats.extend(batch)
            if len(batch) < 200:
                break
            offset += 200
        if len(set(property_ids)) != len(property_ids):
            raise ValueError("a flat is listed twice")
        if not set(property_ids) <= {flat.id for flat in flats}:
            raise LookupError("a flat is not the company's")
        places = {flat_id: index for index, flat_id in enumerate(property_ids)}
        await self._property_repo.set_positions(company_id, places)
