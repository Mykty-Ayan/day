from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal

from sqlalchemy import and_, func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.inventory.entities import (
    GuestOrder,
    GuestOrderItem,
    MovementKind,
    OrderBilling,
    OrderPayment,
    OrderPaymentStatus,
    OrderStatus,
    Product,
    StockMovement,
)
from app.domain.inventory.repositories import GuestOrderRepository, ProductRepository, StockMovementRepository
from app.infrastructure.models.inventory import GuestOrderItemModel, GuestOrderModel, ProductModel, StockMovementModel


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


def _to_order(m: GuestOrderModel, items: list[GuestOrderItemModel]) -> GuestOrder:
    return GuestOrder(
        id=m.id,
        company_id=m.company_id,
        booking_id=m.booking_id,
        property_id=m.property_id,
        number=m.number,
        status=OrderStatus(m.status),
        billing=OrderBilling(m.billing),
        total=Decimal(str(m.total)),
        guest_note=m.guest_note,
        payment_status=OrderPaymentStatus(m.payment_status) if m.payment_status else None,
        payment_method=OrderPayment(m.payment_method) if m.payment_method else None,
        paid_at=m.paid_at,
        created_at=m.created_at,
        accepted_at=m.accepted_at,
        invoiced_at=m.invoiced_at,
        delivered_at=m.delivered_at,
        cancelled_at=m.cancelled_at,
        handled_by=m.handled_by,
        items=[
            GuestOrderItem(
                id=i.id, product_id=i.product_id, name=i.name, price=Decimal(str(i.price)), quantity=i.quantity
            )
            for i in items
        ],
    )


class SqlGuestOrderRepository(GuestOrderRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def _with_items(self, models: Sequence[GuestOrderModel]) -> list[GuestOrder]:
        if not models:
            return []
        rows = await self._session.scalars(
            select(GuestOrderItemModel).where(GuestOrderItemModel.order_id.in_([m.id for m in models]))
        )
        items: dict[uuid.UUID, list[GuestOrderItemModel]] = {}
        for item in rows:
            items.setdefault(item.order_id, []).append(item)
        return [_to_order(m, items.get(m.id, [])) for m in models]

    async def add(self, order: GuestOrder) -> GuestOrder:
        # Held to the transaction's end: two orders at once take numbers one after the other.
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"guest-order:{order.company_id}"}
        )
        last = await self._session.scalar(
            select(func.max(GuestOrderModel.number)).where(GuestOrderModel.company_id == order.company_id)
        )
        model = GuestOrderModel(
            id=order.id,
            company_id=order.company_id,
            booking_id=order.booking_id,
            property_id=order.property_id,
            number=(last or 0) + 1,
            status=order.status.value,
            billing=order.billing.value,
            total=order.total,
            guest_note=order.guest_note,
        )
        self._session.add(model)
        await self._session.flush()
        for item in order.items:
            self._session.add(
                GuestOrderItemModel(
                    id=item.id, order_id=model.id, product_id=item.product_id, name=item.name, price=item.price,
                    quantity=item.quantity,
                )
            )
        await self._session.flush()
        await self._session.refresh(model)
        return (await self._with_items([model]))[0]

    async def hold(self, booking_id: uuid.UUID) -> None:
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"guest-order-booking:{booking_id}"}
        )

    async def recent_new(self, booking_id: uuid.UUID, since: datetime) -> list[GuestOrder]:
        models = await self._session.scalars(
            select(GuestOrderModel).where(
                GuestOrderModel.booking_id == booking_id,
                GuestOrderModel.status == OrderStatus.NEW.value,
                GuestOrderModel.created_at >= since,
            )
        )
        return await self._with_items(list(models))

    async def count_since(self, booking_id: uuid.UUID, since: datetime) -> int:
        return await self._session.scalar(
            select(func.count()).where(GuestOrderModel.booking_id == booking_id, GuestOrderModel.created_at >= since)
        )

    async def get(self, company_id: uuid.UUID, order_id: uuid.UUID) -> GuestOrder | None:
        model = await self._session.scalar(
            select(GuestOrderModel).where(GuestOrderModel.id == order_id, GuestOrderModel.company_id == company_id)
        )
        return (await self._with_items([model]))[0] if model else None

    async def list(self, company_id: uuid.UUID, *, status: OrderStatus | None = None) -> Sequence[GuestOrder]:
        stmt = select(GuestOrderModel).where(GuestOrderModel.company_id == company_id)
        if status is not None:
            stmt = stmt.where(GuestOrderModel.status == status.value)
        stmt = stmt.order_by(GuestOrderModel.created_at.desc()).limit(200)
        return await self._with_items(list(await self._session.scalars(stmt)))

    async def list_for_booking(self, company_id: uuid.UUID, booking_id: uuid.UUID) -> list[GuestOrder]:
        stmt = (
            select(GuestOrderModel)
            .where(GuestOrderModel.company_id == company_id, GuestOrderModel.booking_id == booking_id)
            .order_by(GuestOrderModel.created_at.desc())
            .limit(50)
        )
        return await self._with_items(list(await self._session.scalars(stmt)))

    async def due_by_bookings(
        self, company_id: uuid.UUID, booking_ids: Sequence[uuid.UUID]
    ) -> dict[uuid.UUID, Decimal]:
        if not booking_ids:
            return {}
        rows = await self._session.execute(
            select(GuestOrderModel.booking_id, func.sum(GuestOrderModel.total))
            .where(
                GuestOrderModel.company_id == company_id,
                GuestOrderModel.booking_id.in_(booking_ids),
                GuestOrderModel.status != OrderStatus.CANCELLED.value,
                GuestOrderModel.payment_status.is_distinct_from(OrderPaymentStatus.PAID.value),
                or_(
                    GuestOrderModel.payment_status == OrderPaymentStatus.ON_BOOKING.value,
                    and_(
                        GuestOrderModel.billing == OrderBilling.BOOKING.value,
                        GuestOrderModel.status.in_([OrderStatus.ACCEPTED.value, OrderStatus.DELIVERED.value]),
                    ),
                ),
            )
            .group_by(GuestOrderModel.booking_id)
        )
        return {booking_id: Decimal(str(total)) for booking_id, total in rows.all()}

    async def move(
        self,
        company_id: uuid.UUID,
        order_id: uuid.UUID,
        allowed: set[OrderStatus],
        order: GuestOrder,
        was: OrderPaymentStatus | None,
    ) -> GuestOrder | None:
        # One conditional update: of two hands at once, the second changes nothing.
        # Compare-and-set on the payment as read too: a payment recorded meanwhile stays.
        guards = [
            GuestOrderModel.id == order_id,
            GuestOrderModel.company_id == company_id,
            GuestOrderModel.status.in_([s.value for s in allowed]),
            GuestOrderModel.payment_status.is_not_distinct_from(was.value if was else None),
        ]
        if order.payment_status != OrderPaymentStatus.PAID:
            guards.append(GuestOrderModel.payment_status.is_distinct_from(OrderPaymentStatus.PAID.value))
        model = await self._session.scalar(
            update(GuestOrderModel)
            .where(*guards)
            .values(
                status=order.status.value,
                payment_status=order.payment_status.value if order.payment_status else None,
                payment_method=order.payment_method.value if order.payment_method else None,
                paid_at=order.paid_at,
                accepted_at=order.accepted_at,
                invoiced_at=order.invoiced_at,
                delivered_at=order.delivered_at,
                cancelled_at=order.cancelled_at,
                handled_by=order.handled_by,
            )
            .returning(GuestOrderModel)
        )
        return (await self._with_items([model]))[0] if model else None
