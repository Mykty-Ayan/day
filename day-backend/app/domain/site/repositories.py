from __future__ import annotations

import abc
import uuid

from app.domain.site.entities import CompanySite


class CompanySiteRepository(abc.ABC):
    @abc.abstractmethod
    async def get(self, company_id: uuid.UUID) -> CompanySite | None: ...

    @abc.abstractmethod
    async def get_by_slug(self, slug: str) -> CompanySite | None: ...

    @abc.abstractmethod
    async def save(self, site: CompanySite) -> CompanySite:
        """Insert or replace the company's site. A slug another company holds raises SlugTakenError."""


class SlugTakenError(Exception):
    """Another company's site has this address."""
