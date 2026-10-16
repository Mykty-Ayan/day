from __future__ import annotations

import uuid

from app.domain.property.entities import PropertyPhoto
from app.domain.property.repositories import PropertyPhotoRepository, PropertyRepository
from app.domain.property.value_objects import FactAudience


class ManagePhotosService:
    def __init__(
        self,
        property_repo: PropertyRepository,
        photo_repo: PropertyPhotoRepository,
    ) -> None:
        self._property_repo = property_repo
        self._photo_repo = photo_repo

    async def add_photo(
        self,
        property_id: uuid.UUID,
        company_id: uuid.UUID,
        url: str,
        *,
        sort_order: int = 0,
        is_cover: bool = False,
        caption: str | None = None,
        audience: FactAudience = FactAudience.PUBLIC,
    ) -> PropertyPhoto:
        prop = await self._property_repo.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")
        # The cover opens the listing; a check-in photo never reaches the listing.
        if is_cover and audience == FactAudience.GUEST:
            raise ValueError("A check-in photo cannot be the cover")

        photo = PropertyPhoto(
            property_id=property_id,
            url=url,
            sort_order=sort_order,
            is_cover=is_cover,
            caption=caption,
            audience=audience,
        )
        return await self._photo_repo.save(photo)

    async def set_caption(
        self, photo_id: uuid.UUID, property_id: uuid.UUID, company_id: uuid.UUID, caption: str | None
    ) -> PropertyPhoto:
        prop = await self._property_repo.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")
        photo = next((p for p in await self._photo_repo.list_by_property(property_id) if p.id == photo_id), None)
        if photo is None:
            raise ValueError("Photo not found")
        await self._photo_repo.set_caption(photo_id, caption)
        photo.caption = caption
        return photo

    async def delete_photo(
        self,
        photo_id: uuid.UUID,
        property_id: uuid.UUID,
        company_id: uuid.UUID,
    ) -> None:
        prop = await self._property_repo.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")
        # The apartment checked above must own the photo, or any apartment of
        # the company would open a door to every photo by its id.
        if not any(p.id == photo_id for p in await self._photo_repo.list_by_property(property_id)):
            raise ValueError("Photo not found")
        await self._photo_repo.delete(photo_id)

    async def reorder_photos(
        self,
        property_id: uuid.UUID,
        company_id: uuid.UUID,
        photo_ids: list[uuid.UUID],
    ) -> list[PropertyPhoto]:
        prop = await self._property_repo.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")
        await self._photo_repo.reorder(property_id, photo_ids)
        return await self._photo_repo.list_by_property(property_id)

    async def list_photos(
        self, property_id: uuid.UUID, company_id: uuid.UUID
    ) -> list[PropertyPhoto]:
        prop = await self._property_repo.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")
        return await self._photo_repo.list_by_property(property_id)
