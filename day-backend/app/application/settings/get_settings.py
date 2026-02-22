from __future__ import annotations

import uuid

from app.domain.settings.entities import CompanySettings
from app.domain.settings.repositories import CompanySettingsRepository


class GetSettingsService:
    def __init__(self, repo: CompanySettingsRepository) -> None:
        self._repo = repo

    async def execute(self, company_id: uuid.UUID) -> CompanySettings:
        """Get settings for a company, returning defaults if none exist."""
        settings = await self._repo.get_by_company(company_id)
        if settings is None:
            # Return default settings (not persisted yet)
            return CompanySettings(company_id=company_id)
        return settings
