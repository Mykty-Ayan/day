"""AI Migration API endpoints."""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.ai_migration.confirm_import import ConfirmImportInput, ConfirmImportService
from app.application.ai_migration.get_import import GetImportInput, GetImportService
from app.application.ai_migration.list_imports import ListImportsInput, ListImportsService
from app.application.ai_migration.start_import import StartImportInput, StartImportService
from app.application.ai_migration.start_text_import import StartTextImportInput, StartTextImportService
from app.application.property.create_property import CreatePropertyService
from app.application.property.manage_photos import ManagePhotosService
from app.application.property.manage_pricing import ManagePricingService
from app.config import settings
from app.infrastructure.ai_service_client import AIServiceClient
from app.infrastructure.database import get_session
from app.infrastructure.repositories.ai_migration import SqlImportJobRepository
from app.infrastructure.repositories.property import (
    SqlDiscountRuleRepository,
    SqlPricingConfigRepository,
    SqlPropertyAuditLogRepository,
    SqlPropertyPhotoRepository,
    SqlPropertyRepository,
    SqlSeasonalPriceRepository,
)
from app.presentation.api.deps import get_company_id, get_user_id
from app.presentation.schemas.ai_migration import (
    ImportBatchRequest,
    ImportBatchResponse,
    ImportConfirmRequest,
    ImportJobListResponse,
    ImportJobResponse,
    ImportStartRequest,
    ImportTextStartRequest,
)
from app.presentation.schemas.property import PropertyResponse

ai_migration_router = APIRouter(prefix="/ai", tags=["ai-migration"])
_ALLOWED_PHOTO_HOSTS = {"krisha-photos.kcdn.online"}


# ---------- helpers ----------


def _repos(session: AsyncSession):
    return {
        "import_job": SqlImportJobRepository(session),
        "property": SqlPropertyRepository(session),
        "photo": SqlPropertyPhotoRepository(session),
        "pricing": SqlPricingConfigRepository(session),
        "seasonal": SqlSeasonalPriceRepository(session),
        "discount": SqlDiscountRuleRepository(session),
        "audit": SqlPropertyAuditLogRepository(session),
    }


def _ai_client() -> AIServiceClient:
    return AIServiceClient(base_url=settings.AI_SERVICE_URL)


def _normalize_external_photo_url(url: str) -> str:
    candidate = url.strip()
    if not candidate:
        raise ValueError("Photo URL is empty")

    parsed = urlsplit(candidate)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only http/https photo URLs are allowed")

    host = parsed.netloc.lower()
    if host not in _ALLOWED_PHOTO_HOSTS and not (host.startswith("photos-") and host.endswith(".krisha.kz")):
        raise ValueError("Photo host is not allowed")

    return candidate


def _filename_from_url(url: str) -> str:
    parsed = urlsplit(url)
    name = Path(parsed.path).name
    # Strip chars that could inject into Content-Disposition header
    name = re.sub(r'[^\w.\-]', '_', name) if name else "photo.jpg"
    return name or "photo.jpg"


def _to_job_response(job) -> ImportJobResponse:
    return ImportJobResponse(
        id=job.id,
        company_id=job.company_id,
        source_url=job.source_url,
        user_prompt=job.user_prompt,
        status=job.status,
        source_type=job.source_type,
        extracted_data=job.extracted_data,
        mapped_property=job.mapped_property,
        error_message=job.error_message,
        created_by=job.created_by,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _to_property_response(p) -> PropertyResponse:
    return PropertyResponse(
        id=p.id,
        company_id=p.company_id,
        name=p.name,
        internal_name=p.internal_name,
        type=p.type,
        status=p.status,
        description=p.description,
        source_url=p.source_url,
        latitude=p.latitude,
        longitude=p.longitude,
        address_full=p.address_full,
        apartment_number=p.apartment_number,
        entrance=p.entrance,
        block=p.block,
        floor=p.floor,
        rooms=p.rooms,
        beds=p.beds,
        area_living=p.area_living,
        area_total=p.area_total,
        check_in_instructions=p.check_in_instructions,
        check_out_instructions=p.check_out_instructions,
        house_rules=p.house_rules,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


# ---------- Routes ----------


@ai_migration_router.post("/import", response_model=ImportJobResponse, status_code=201)
async def start_import(
    body: ImportStartRequest,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
):
    repos = _repos(session)
    svc = StartImportService(repos["import_job"], _ai_client())
    try:
        result = await svc.execute(
            StartImportInput(
                company_id=company_id,
                source_url=body.source_url,
                user_prompt=body.user_prompt,
                created_by=user_id,
            )
        )
        await session.commit()
        return _to_job_response(result)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@ai_migration_router.post("/import/text", response_model=ImportJobResponse, status_code=201)
async def start_text_import(
    body: ImportTextStartRequest,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
):
    repos = _repos(session)
    svc = StartTextImportService(repos["import_job"], _ai_client())
    try:
        result = await svc.execute(
            StartTextImportInput(
                company_id=company_id,
                text=body.text,
                user_prompt=body.user_prompt,
                created_by=user_id,
            )
        )
        await session.commit()
        return _to_job_response(result)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@ai_migration_router.get("/import", response_model=ImportJobListResponse)
async def list_imports(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ListImportsService(repos["import_job"])
    offset = (page - 1) * per_page
    result = await svc.execute(ListImportsInput(company_id=company_id, offset=offset, limit=per_page))
    pages = (result.total + per_page - 1) // per_page if result.total > 0 else 1
    return ImportJobListResponse(
        items=[_to_job_response(j) for j in result.items],
        total=result.total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@ai_migration_router.get("/import/{job_id}", response_model=ImportJobResponse)
async def get_import(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = GetImportService(repos["import_job"])
    try:
        result = await svc.execute(GetImportInput(job_id=job_id, company_id=company_id))
        return _to_job_response(result)
    except ValueError:
        raise HTTPException(status_code=404, detail="Import job not found")


@ai_migration_router.post("/import/{job_id}/confirm", response_model=PropertyResponse, status_code=201)
async def confirm_import(
    job_id: uuid.UUID,
    body: ImportConfirmRequest,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
):
    repos = _repos(session)
    create_property_svc = CreatePropertyService(repos["property"], repos["audit"])
    pricing_svc = ManagePricingService(repos["property"], repos["pricing"], repos["seasonal"], repos["discount"])
    photos_svc = ManagePhotosService(repos["property"], repos["photo"])
    svc = ConfirmImportService(repos["import_job"], create_property_svc, pricing_svc, photos_svc)
    try:
        result = await svc.execute(
            ConfirmImportInput(
                job_id=job_id,
                company_id=company_id,
                property_data=body.property_data,
                changed_by=user_id,
            )
        )
        await session.commit()
        return _to_property_response(result)
    except ValueError as e:
        await session.rollback()
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        if "already exists" in msg.lower():
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@ai_migration_router.post("/import/batch", response_model=ImportBatchResponse, status_code=201)
async def batch_import(
    body: ImportBatchRequest,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
):
    repos = _repos(session)
    ai_client = _ai_client()
    svc = StartImportService(repos["import_job"], ai_client)

    jobs = []
    for url in body.urls:
        result = await svc.execute(
            StartImportInput(
                company_id=company_id,
                source_url=url,
                user_prompt=body.user_prompt,
                created_by=user_id,
            )
        )
        jobs.append(result)

    await session.commit()
    return ImportBatchResponse(
        jobs=[_to_job_response(j) for j in jobs],
        total_submitted=len(jobs),
    )


@ai_migration_router.get("/photo/download")
async def download_external_photo(
    url: str = Query(..., min_length=1, max_length=2048),
):
    try:
        normalized_url = _normalize_external_photo_url(url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    timeout = httpx.Timeout(20.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            upstream = await client.get(normalized_url)
            upstream.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=422, detail=f"Failed to download photo: {e}") from e

    content_type = upstream.headers.get("content-type", "application/octet-stream").split(";")[0].strip()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="URL does not point to an image")

    filename = _filename_from_url(normalized_url)
    return Response(
        content=upstream.content,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "private, max-age=60",
        },
    )
