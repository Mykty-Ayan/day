from __future__ import annotations

import uuid
from collections.abc import Sequence
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.inventory.entities import Product
from app.domain.inventory.repositories import ProductRepository
from app.infrastructure.models.inventory import ProductModel


def _to_product(m: ProductModel) -> Product:
    return Product(
        id=m.id,
        company_id=m.company_id,
        name=m.name,
        category=m.category,
        description=m.description,
        photo_url=m.photo_url,
        price=Decimal(str(m.price)),
        is_active=m.is_active,
        sort_order=m.sort_order,
        created_at=m.created_at,
        archived_at=m.archived_at,
    )


class SqlProductRepository(ProductRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def _query(self, company_id: uuid.UUID):
        return select(ProductModel).where(ProductModel.company_id == company_id)

    async def add(self, product: Product) -> Product:
        model = ProductModel(
            id=product.id,
            company_id=product.company_id,
            name=product.name,
            category=product.category,
            description=product.description,
            photo_url=product.photo_url,
            price=product.price,
            is_active=product.is_active,
            sort_order=product.sort_order,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _to_product(model)

    async def get(self, company_id: uuid.UUID, product_id: uuid.UUID) -> Product | None:
        model = await self._session.scalar(self._query(company_id).where(ProductModel.id == product_id))
        return _to_product(model) if model else None

    async def list(self, company_id: uuid.UUID, *, include_archived: bool = False) -> Sequence[Product]:
        stmt = self._query(company_id)
        if not include_archived:
            stmt = stmt.where(ProductModel.archived_at.is_(None))
        stmt = stmt.order_by(ProductModel.sort_order, ProductModel.name)
        return [_to_product(m) for m in await self._session.scalars(stmt)]

    async def save(self, product: Product) -> Product:
        model = await self._session.scalar(
            select(ProductModel).where(ProductModel.id == product.id, ProductModel.company_id == product.company_id)
        )
        if model is None:
            raise LookupError("Product not found")
        for name in ("name", "category", "description", "photo_url", "price", "is_active", "sort_order"):
            setattr(model, name, getattr(product, name))
        model.archived_at = product.archived_at
        await self._session.flush()
        return _to_product(model)

