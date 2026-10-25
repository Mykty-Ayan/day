"""The minibar's catalogue: what a guest may order, at what price."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal

from app.domain.inventory.entities import MAX_MONEY, Product
from app.domain.inventory.repositories import ProductRepository

_EDITABLE = ("name", "category", "description", "price", "is_active", "sort_order")


class ManageStockService:
    def __init__(self, products: ProductRepository) -> None:
        self._products = products

    async def add_product(self, company_id: uuid.UUID, **fields) -> Product:
        product = Product(company_id=company_id, name="", price=Decimal(0))
        _apply(product, fields)
        return await self._products.add(product)

    async def update_product(self, company_id: uuid.UUID, product_id: uuid.UUID, **fields) -> Product:
        product = await self._get(company_id, product_id)
        _apply(product, fields)
        return await self._products.save(product)

    async def archive_product(self, company_id: uuid.UUID, product_id: uuid.UUID) -> Product:
        product = await self._get(company_id, product_id)
        if product.archived_at is None:
            product.archived_at = datetime.utcnow()
            product.is_active = False
            product = await self._products.save(product)
        return product

    async def set_photo(self, company_id: uuid.UUID, product_id: uuid.UUID, url: str) -> Product:
        product = await self._get(company_id, product_id)
        product.photo_url = url
        return await self._products.save(product)

    async def get(self, company_id: uuid.UUID, product_id: uuid.UUID) -> Product:
        return await self._get(company_id, product_id)

    async def list(self, company_id: uuid.UUID, *, include_archived: bool = False) -> Sequence[Product]:
        return await self._products.list(company_id, include_archived=include_archived)

    async def _get(self, company_id: uuid.UUID, product_id: uuid.UUID) -> Product:
        product = await self._products.get(company_id, product_id)
        if product is None:
            raise LookupError("Product not found")
        return product


def _apply(product: Product, fields: dict) -> None:
    for name, value in fields.items():
        if name not in _EDITABLE:
            raise ValueError(f"{name} cannot be changed here")
        if name in ("name", "category"):
            value = (value or "").strip()
        if name == "description":
            value = (value or "").strip() or None
        setattr(product, name, value)
    if not product.name:
        raise ValueError("The product needs a name")
    if not 0 <= product.price <= MAX_MONEY:
        raise ValueError("The price must be from 0 to 9 999 999 999.99")
