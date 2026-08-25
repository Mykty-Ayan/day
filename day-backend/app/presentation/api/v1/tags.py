"""Property Tags API endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.property.batch_pricing_by_tag import BatchUpdatePricingByTagService
from app.application.property.manage_tags import ManageTagsService
from app.domain.auth.permissions import Permission
from app.infrastructure.database import get_session
from app.infrastructure.repositories.property import (
    SqlPricingConfigRepository,
    SqlPropertyRepository,
    SqlPropertyTagRepository,
)
from app.presentation.api.deps import get_company_id, require
from app.presentation.schemas.property import (
    BatchPricingUpdate,
    TagCreate,
    TagResponse,
    TagUpdate,
)

tag_router = APIRouter(prefix="/tags", tags=["tags"])


def _tag_repos(session: AsyncSession):
    return {
        "tag": SqlPropertyTagRepository(session),
        "property": SqlPropertyRepository(session),
        "pricing": SqlPricingConfigRepository(session),
    }


# ---------- Tag CRUD ----------


@tag_router.post(
    "",
    response_model=TagResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def create_tag(
    body: TagCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _tag_repos(session)
    svc = ManageTagsService(repos["tag"], repos["property"])
    try:
        result = await svc.create_tag(company_id, body.name, body.color)
        await session.commit()
        return TagResponse.model_validate(result, from_attributes=True)
    except ValueError as e:
        await session.rollback()
        status_code = 409 if "already exists" in str(e).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(e))


@tag_router.get("", response_model=list[TagResponse], dependencies=[Depends(require(Permission.PROPERTIES_READ))])
async def list_tags(
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _tag_repos(session)
    svc = ManageTagsService(repos["tag"], repos["property"])
    result = await svc.list_tags(company_id)
    return [TagResponse.model_validate(t, from_attributes=True) for t in result]


@tag_router.patch("/{tag_id}", response_model=TagResponse, dependencies=[Depends(require(Permission.PROPERTIES_WRITE))])
async def update_tag(
    tag_id: uuid.UUID,
    body: TagUpdate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _tag_repos(session)
    svc = ManageTagsService(repos["tag"], repos["property"])
    provided = body.model_dump(exclude_unset=True)
    try:
        result = await svc.update_tag(tag_id, company_id, **provided)
        await session.commit()
        return TagResponse.model_validate(result, from_attributes=True)
    except ValueError as e:
        await session.rollback()
        status_code = 409 if "already exists" in str(e).lower() else 404
        raise HTTPException(status_code=status_code, detail=str(e))


@tag_router.delete("/{tag_id}", status_code=204, dependencies=[Depends(require(Permission.PROPERTIES_WRITE))])
async def delete_tag(
    tag_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _tag_repos(session)
    svc = ManageTagsService(repos["tag"], repos["property"])
    try:
        await svc.delete_tag(tag_id, company_id)
        await session.commit()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(e))


# ---------- Batch pricing ----------


@tag_router.post("/{tag_id}/batch-pricing", dependencies=[Depends(require(Permission.PROPERTIES_WRITE))])
async def batch_update_pricing(
    tag_id: uuid.UUID,
    body: BatchPricingUpdate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _tag_repos(session)
    svc = BatchUpdatePricingByTagService(repos["tag"], repos["pricing"])
    try:
        updated = await svc.execute(tag_id, company_id, body.base_price)
        await session.commit()
        return {"updated_count": updated}
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(e))
