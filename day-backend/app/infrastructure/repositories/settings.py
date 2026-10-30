from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.settings.entities import CompanySettings
from app.domain.settings.repositories import CompanySettingsRepository
from app.domain.settings.value_objects import Currency, Language
from app.infrastructure.models.settings import CompanySettingsModel


def _model_to_settings(m: CompanySettingsModel) -> CompanySettings:
    return CompanySettings(
        id=m.id,
        company_id=m.company_id,
        default_currency=Currency(m.default_currency),
        default_language=Language(m.default_language),
        time_zone=m.time_zone,
        secrets_lead_hours_daily=m.secrets_lead_hours_daily,
        secrets_lead_hours_hourly=m.secrets_lead_hours_hourly,
        minibar_invoice=m.minibar_invoice,
        minibar_on_booking=m.minibar_on_booking,
        minibar_opens=m.minibar_opens,
        minibar_closes=m.minibar_closes,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


class SqlCompanySettingsRepository(CompanySettingsRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_company(self, company_id: uuid.UUID) -> CompanySettings | None:
        stmt = select(CompanySettingsModel).where(CompanySettingsModel.company_id == company_id)
        result = await self._session.scalar(stmt)
        return _model_to_settings(result) if result else None

    async def save(self, settings: CompanySettings) -> CompanySettings:
        model = CompanySettingsModel(
            id=settings.id,
            company_id=settings.company_id,
            default_currency=settings.default_currency.value,
            default_language=settings.default_language.value,
            time_zone=settings.time_zone,
            secrets_lead_hours_daily=settings.secrets_lead_hours_daily,
            secrets_lead_hours_hourly=settings.secrets_lead_hours_hourly,
            minibar_invoice=settings.minibar_invoice,
            minibar_on_booking=settings.minibar_on_booking,
            minibar_opens=settings.minibar_opens,
            minibar_closes=settings.minibar_closes,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_settings(model)

    async def update(self, settings: CompanySettings) -> CompanySettings:
        stmt = (
            update(CompanySettingsModel)
            .where(CompanySettingsModel.id == settings.id)
            .values(
                default_currency=settings.default_currency.value,
                default_language=settings.default_language.value,
                time_zone=settings.time_zone,
                secrets_lead_hours_daily=settings.secrets_lead_hours_daily,
                secrets_lead_hours_hourly=settings.secrets_lead_hours_hourly,
                minibar_invoice=settings.minibar_invoice,
                minibar_on_booking=settings.minibar_on_booking,
                minibar_opens=settings.minibar_opens,
                minibar_closes=settings.minibar_closes,
                updated_at=datetime.utcnow(),
            )
        )
        await self._session.execute(stmt)
        await self._session.flush()
        result = await self._session.get(CompanySettingsModel, settings.id)
        return _model_to_settings(result)  # type: ignore[arg-type]
