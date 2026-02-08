from __future__ import annotations

import uuid

from app.domain.property.entities import Amenity
from app.domain.property.repositories import AmenityRepository, PropertyRepository
from app.domain.property.value_objects import AmenityCategory


class ManageAmenitiesService:
    def __init__(
        self,
        amenity_repo: AmenityRepository,
        property_repo: PropertyRepository,
    ) -> None:
        self._amenity_repo = amenity_repo
        self._property_repo = property_repo

    async def create_amenity(
        self, name: str, category: AmenityCategory, icon: str | None = None
    ) -> Amenity:
        amenity = Amenity(name=name, icon=icon, category=category)
        return await self._amenity_repo.save(amenity)

    async def list_amenities(self) -> list[Amenity]:
        return await self._amenity_repo.list_all()

    async def set_property_amenities(
        self,
        property_id: uuid.UUID,
        company_id: uuid.UUID,
        amenity_ids: list[uuid.UUID],
    ) -> list[Amenity]:
        prop = await self._property_repo.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")
        await self._amenity_repo.set_property_amenities(property_id, amenity_ids)
        return await self._amenity_repo.get_property_amenities(property_id)

    async def get_property_amenities(
        self, property_id: uuid.UUID, company_id: uuid.UUID
    ) -> list[Amenity]:
        prop = await self._property_repo.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")
        return await self._amenity_repo.get_property_amenities(property_id)
