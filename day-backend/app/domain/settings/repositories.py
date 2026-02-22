from __future__ import annotations

import abc
import uuid

from app.domain.settings.entities import CompanySettings


class CompanySettingsRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_company(self, company_id: uuid.UUID) -> CompanySettings | None: ...

    @abc.abstractmethod
    async def save(self, settings: CompanySettings) -> CompanySettings: ...

    @abc.abstractmethod
    async def update(self, settings: CompanySettings) -> CompanySettings: ...
