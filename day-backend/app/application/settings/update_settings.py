from __future__ import annotations

import uuid

from app.domain.settings.entities import CompanySettings
from app.domain.settings.repositories import CompanySettingsRepository
from app.domain.settings.value_objects import Currency, Language


class UpdateSettingsService:
    def __init__(self, repo: CompanySettingsRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        company_id: uuid.UUID,
        *,
        default_currency: Currency | None = None,
        default_language: Language | None = None,
        time_zone: str | None = None,
        secrets_lead_hours_daily: int | None = None,
        secrets_lead_hours_hourly: int | None = None,
    ) -> CompanySettings:
        lead = {
            "secrets_lead_hours_daily": secrets_lead_hours_daily,
            "secrets_lead_hours_hourly": secrets_lead_hours_hourly,
        }
        settings = await self._repo.get_by_company(company_id)
        if settings is None:
            # Create new settings with defaults
            settings = CompanySettings(
                id=uuid.uuid4(),
                company_id=company_id,
            )
            if default_currency is not None:
                settings.default_currency = default_currency
            if default_language is not None:
                settings.default_language = default_language
            if time_zone is not None:
                settings.time_zone = time_zone
            for name, hours in lead.items():
                if hours is not None:
                    setattr(settings, name, hours)
            return await self._repo.save(settings)

        if default_currency is not None:
            settings.default_currency = default_currency
        if default_language is not None:
            settings.default_language = default_language
        if time_zone is not None:
            settings.time_zone = time_zone
        for name, hours in lead.items():
            if hours is not None:
                setattr(settings, name, hours)
        return await self._repo.update(settings)
