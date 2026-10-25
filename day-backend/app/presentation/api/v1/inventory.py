"""The minibar's catalogue.

Seeing it is for whoever handles bookings (guests' orders come from it);
changing it needs inventory:manage.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.inventory.manage_stock import ManageStockService
from app.config import settings
from app.domain.auth.permissions import Permission
from app.infrastructure.database import get_session
from app.infrastructure.repositories.inventory import SqlProductRepository
from app.infrastructure.storage.s3 import upload_product_photo
from app.presentation.api.deps import get_company_id, require
from app.presentation.api.v1.properties import _sniff_photo
from app.presentation.schemas.inventory import ProductCreate, ProductResponse, ProductUpdate

inventory_router = APIRouter(prefix="/inventory", tags=["inventory"])

_read = [Depends(require(Permission.BOOKINGS_READ))]
_manage = [Depends(require(Permission.INVENTORY_MANAGE))]


def _service(session: AsyncSession) -> ManageStockService:
    return ManageStockService(SqlProductRepository(session))


async def _done(session: AsyncSession, call):
    """Run a change; 404 for another company's product, 422 for a wrong value."""
    try:
        result = await call
    except LookupError:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    await session.commit()
    return result


@inventory_router.get("/products", response_model=list[ProductResponse], dependencies=_read)
async def list_products(
    include_archived: bool = False,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    return await _service(session).list(company_id, include_archived=include_archived)


@inventory_router.post(
    "/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED, dependencies=_manage
)
async def add_product(
    body: ProductCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    return await _done(session, _service(session).add_product(company_id, **body.model_dump()))


@inventory_router.patch("/products/{product_id}", response_model=ProductResponse, dependencies=_manage)
async def update_product(
    product_id: uuid.UUID,
    body: ProductUpdate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    changes = body.model_dump(exclude_unset=True)
    # A name and a price can be changed, not removed.
    if any(changes.get(k, "") is None for k in ("name", "price", "is_active", "sort_order")):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A value cannot be empty")
    return await _done(session, _service(session).update_product(company_id, product_id, **changes))


@inventory_router.post("/products/{product_id}/archive", response_model=ProductResponse, dependencies=_manage)
async def archive_product(
    product_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    return await _done(session, _service(session).archive_product(company_id, product_id))


@inventory_router.post("/products/{product_id}/photo", response_model=ProductResponse, dependencies=_manage)
async def upload_photo(
    product_id: uuid.UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    """The product's picture for the guest's menu: JPEG, PNG or WebP."""
    svc = _service(session)
    try:
        await svc.get(company_id, product_id)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    content_type = _sniff_photo(file.file.read(16))
    file.file.seek(0)
    if content_type is None:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG or WebP photos")
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > settings.S3_MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413, detail=f"Photo too large (max {settings.S3_MAX_UPLOAD_BYTES // (1024 * 1024)} MB)"
        )
    try:
        url = await upload_product_photo(company_id=company_id, file_obj=file.file, content_type=content_type)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to upload photo")
    return await _done(session, svc.set_photo(company_id, product_id, url))

