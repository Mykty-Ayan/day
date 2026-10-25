from __future__ import annotations

import uuid
from collections.abc import Sequence
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.inventory.entities import MovementKind, Product, StockMovement
from app.domain.inventory.repositories import ProductRepository, StockMovementRepository
from app.infrastructure.models.inventory import ProductModel, StockMovementModel


def _to_product(m: ProductModel, stock: int = 0) -> Product:
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
        par_level=m.par_level,
        created_at=m.created_at,
        archived_at=m.archived_at,
        stock=stock,
    )


def _to_movement(m: StockMovementModel) -> StockMovement:
    return StockMovement(
        id=m.id,
        company_id=m.company_id,
        product_id=m.product_id,
        kind=MovementKind(m.kind),
        quantity=m.quantity,
        unit_cost=Decimal(str(m.unit_cost)) if m.unit_cost is not None else None,
        order_id=m.order_id,
        expense_id=m.expense_id,
        note=m.note,
        created_by=m.created_by,
        created_at=m.created_at,
    )


class SqlProductRepository(ProductRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def _query(self, company_id: uuid.UUID):
        # The stock of each product: the sum of its movements, 0 with none.
        stock = (
            select(StockMovementModel.product_id, func.sum(StockMovementModel.quantity).label("stock"))
            .where(StockMovementModel.company_id == company_id)
            .group_by(StockMovementModel.product_id)
            .subquery()
        )
        return (
            select(ProductModel, func.coalesce(stock.c.stock, 0))
            .outerjoin(stock, stock.c.product_id == ProductModel.id)
            .where(ProductModel.company_id == company_id)
        )

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
            par_level=product.par_level,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _to_product(model)

    async def get(self, company_id: uuid.UUID, product_id: uuid.UUID) -> Product | None:
        row = (await self._session.execute(self._query(company_id).where(ProductModel.id == product_id))).first()
        return _to_product(row[0], int(row[1])) if row else None

    async def list(self, company_id: uuid.UUID, *, include_archived: bool = False) -> Sequence[Product]:
        stmt = self._query(company_id)
        if not include_archived:
            stmt = stmt.where(ProductModel.archived_at.is_(None))
        stmt = stmt.order_by(ProductModel.sort_order, ProductModel.name)
        return [_to_product(m, int(stock)) for m, stock in await self._session.execute(stmt)]

    async def save(self, product: Product) -> Product:
        model = await self._session.scalar(
            select(ProductModel).where(ProductModel.id == product.id, ProductModel.company_id == product.company_id)
        )
        if model is None:
            raise LookupError("Product not found")
        for name in ("name", "category", "description", "photo_url", "price", "is_active", "sort_order", "par_level"):
            setattr(model, name, getattr(product, name))
        model.archived_at = product.archived_at
        await self._session.flush()
        return _to_product(model, product.stock)


class SqlStockMovementRepository(StockMovementRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, movement: StockMovement) -> StockMovement:
        model = StockMovementModel(
            id=movement.id,
            company_id=movement.company_id,
            product_id=movement.product_id,
            kind=movement.kind.value,
            quantity=movement.quantity,
            unit_cost=movement.unit_cost,
            order_id=movement.order_id,
            expense_id=movement.expense_id,
            note=movement.note,
            created_by=movement.created_by,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _to_movement(model)

    async def list_for_product(
        self, company_id: uuid.UUID, product_id: uuid.UUID, *, limit: int = 200
    ) -> Sequence[StockMovement]:
        stmt = (
            select(StockMovementModel)
            .where(StockMovementModel.company_id == company_id, StockMovementModel.product_id == product_id)
            .order_by(StockMovementModel.created_at.desc())
            .limit(limit)
        )
        return [_to_movement(m) for m in await self._session.scalars(stmt)]
