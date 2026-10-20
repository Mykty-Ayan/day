from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.site.entities import CompanySite
from app.domain.site.repositories import CompanySiteRepository, SlugTakenError
from app.infrastructure.models.site import CompanySiteModel

_FIELDS = ("slug", "title", "about", "logo_url", "cover_url", "accent_color", "whatsapp", "instagram")


def _to_site(m: CompanySiteModel) -> CompanySite:
    return CompanySite(company_id=m.company_id, updated_at=m.updated_at, **{f: getattr(m, f) for f in _FIELDS})


class SqlCompanySiteRepository(CompanySiteRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, company_id: uuid.UUID) -> CompanySite | None:
        model = await self._session.get(CompanySiteModel, company_id)
        return _to_site(model) if model else None

    async def get_by_slug(self, slug: str) -> CompanySite | None:
        model = await self._session.scalar(select(CompanySiteModel).where(CompanySiteModel.slug == slug))
        return _to_site(model) if model else None

    async def save(self, site: CompanySite) -> CompanySite:
        model = await self._session.get(CompanySiteModel, site.company_id)
        if model is None:
            model = CompanySiteModel(company_id=site.company_id)
            self._session.add(model)
        for f in _FIELDS:
            setattr(model, f, getattr(site, f))
        model.updated_at = datetime.utcnow()
        try:
            # A savepoint: the unique slug is checked here, two owners racing for one included.
            async with self._session.begin_nested():
                await self._session.flush()
        except IntegrityError as e:
            raise SlugTakenError(site.slug) from e
        return _to_site(model)
