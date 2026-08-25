"""Company Settings API endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.settings.get_settings import GetSettingsService
from app.application.settings.update_settings import UpdateSettingsService
from app.domain.auth.permissions import Permission
from app.infrastructure.database import get_session
from app.infrastructure.repositories.settings import SqlCompanySettingsRepository
from app.presentation.api.deps import get_company_id, require
from app.presentation.schemas.settings import SettingsResponse, SettingsUpdate

settings_router = APIRouter(prefix="/settings", tags=["settings"])


@settings_router.get("", response_model=SettingsResponse, dependencies=[Depends(require(Permission.SETTINGS_READ))])
async def get_settings(
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repo = SqlCompanySettingsRepository(session)
    svc = GetSettingsService(repo)
    result = await svc.execute(company_id)
    return SettingsResponse.model_validate(result, from_attributes=True)


@settings_router.patch("", response_model=SettingsResponse, dependencies=[Depends(require(Permission.SETTINGS_WRITE))])
async def update_settings(
    body: SettingsUpdate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repo = SqlCompanySettingsRepository(session)
    svc = UpdateSettingsService(repo)
    provided = body.model_dump(exclude_unset=True)
    result = await svc.execute(company_id, **provided)
    await session.commit()
    return SettingsResponse.model_validate(result, from_attributes=True)
