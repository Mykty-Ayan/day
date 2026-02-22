from __future__ import annotations

import uuid

from app.domain.property.entities import PropertyTag
from app.domain.property.repositories import PropertyRepository, PropertyTagRepository


class ManageTagsService:
    def __init__(
        self,
        tag_repo: PropertyTagRepository,
        property_repo: PropertyRepository,
    ) -> None:
        self._tag_repo = tag_repo
        self._property_repo = property_repo

    async def create_tag(self, company_id: uuid.UUID, name: str, color: str = "#3B82F6") -> PropertyTag:
        if await self._tag_repo.exists_name(company_id, name):
            raise ValueError(f"Tag '{name}' already exists")
        tag = PropertyTag(
            id=uuid.uuid4(),
            company_id=company_id,
            name=name,
            color=color,
        )
        return await self._tag_repo.save(tag)

    async def list_tags(self, company_id: uuid.UUID) -> list[PropertyTag]:
        return await self._tag_repo.list_by_company(company_id)

    async def update_tag(
        self,
        tag_id: uuid.UUID,
        company_id: uuid.UUID,
        *,
        name: str | None = None,
        color: str | None = None,
    ) -> PropertyTag:
        tag = await self._tag_repo.get_by_id(tag_id)
        if tag is None or tag.company_id != company_id:
            raise ValueError("Tag not found")
        if name is not None:
            if await self._tag_repo.exists_name(company_id, name, exclude_id=tag_id):
                raise ValueError(f"Tag '{name}' already exists")
            tag.name = name
        if color is not None:
            tag.color = color
        return await self._tag_repo.update(tag)

    async def delete_tag(self, tag_id: uuid.UUID, company_id: uuid.UUID) -> None:
        tag = await self._tag_repo.get_by_id(tag_id)
        if tag is None or tag.company_id != company_id:
            raise ValueError("Tag not found")
        await self._tag_repo.delete(tag_id)

    async def assign_tag(
        self,
        property_id: uuid.UUID,
        company_id: uuid.UUID,
        tag_id: uuid.UUID,
    ) -> list[PropertyTag]:
        prop = await self._property_repo.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")
        tag = await self._tag_repo.get_by_id(tag_id)
        if tag is None or tag.company_id != company_id:
            raise ValueError("Tag not found")
        await self._tag_repo.assign_tag(property_id, tag_id)
        return await self._tag_repo.get_property_tags(property_id)

    async def remove_tag(
        self,
        property_id: uuid.UUID,
        company_id: uuid.UUID,
        tag_id: uuid.UUID,
    ) -> None:
        prop = await self._property_repo.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")
        await self._tag_repo.remove_tag(property_id, tag_id)

    async def get_property_tags(self, property_id: uuid.UUID, company_id: uuid.UUID) -> list[PropertyTag]:
        prop = await self._property_repo.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")
        return await self._tag_repo.get_property_tags(property_id)
