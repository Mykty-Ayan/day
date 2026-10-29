from __future__ import annotations

import uuid
from datetime import time

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
        minibar_invoice: bool | None = None,
        minibar_on_booking: bool | None = None,
        **hours: time | None,
    ) -> CompanySettings:
        """`hours`: minibar_opens and minibar_closes, given together (both None:
        round the clock). ValueError when no way to pay the minibar is left on, or
        for hours given apart or equal."""
        if set(hours) - {"minibar_opens", "minibar_closes"}:
            raise TypeError(f"Unknown settings: {sorted(hours)}")
        lead = {
            "secrets_lead_hours_daily": secrets_lead_hours_daily,
            "secrets_lead_hours_hourly": secrets_lead_hours_hourly,
            "minibar_invoice": minibar_invoice,
            "minibar_on_booking": minibar_on_booking,
        }
        if hours:
            opens, closes = hours.get("minibar_opens"), hours.get("minibar_closes")
            if set(hours) != {"minibar_opens", "minibar_closes"} or (opens is None) != (closes is None):
                raise ValueError("The minibar's hours need both the opening and the closing")
            if opens is not None and opens == closes:
                raise ValueError("The minibar cannot open and close at the same time")
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
            self._apply(settings, lead, hours)
            return await self._repo.save(settings)

        if default_currency is not None:
            settings.default_currency = default_currency
        if default_language is not None:
            settings.default_language = default_language
        if time_zone is not None:
            settings.time_zone = time_zone
        self._apply(settings, lead, hours)
        return await self._repo.update(settings)

    @staticmethod
    def _apply(settings: CompanySettings, values: dict, hours: dict) -> None:
        for name, value in values.items():
            if value is not None:
                setattr(settings, name, value)
        for name, value in hours.items():
            setattr(settings, name, value)
        if not (settings.minibar_invoice or settings.minibar_on_booking):
            raise ValueError("The minibar needs at least one way to pay")
