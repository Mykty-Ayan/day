from __future__ import annotations

import abc
import uuid
from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal

from app.domain.inventory.entities import GuestOrder, OrderStatus, Product, StockMovement


class ProductRepository(abc.ABC):
    @abc.abstractmethod
    async def add(self, product: Product) -> Product: ...

    @abc.abstractmethod
    async def get(self, company_id: uuid.UUID, product_id: uuid.UUID) -> Product | None:
        """The company's product with its stock; None for another company's."""

    @abc.abstractmethod
    async def list(self, company_id: uuid.UUID, *, include_archived: bool = False) -> Sequence[Product]:
        """With their stock, in the menu's order."""

    @abc.abstractmethod
    async def save(self, product: Product) -> Product: ...


class StockMovementRepository(abc.ABC):
    @abc.abstractmethod
    async def add(self, movement: StockMovement) -> StockMovement: ...

    @abc.abstractmethod
    async def list_for_product(
        self, company_id: uuid.UUID, product_id: uuid.UUID, *, limit: int = 200
    ) -> Sequence[StockMovement]:
        """Newest first."""


class GuestOrderRepository(abc.ABC):
    @abc.abstractmethod
    async def add(self, order: GuestOrder) -> GuestOrder:
        """Save it with its items under the company's next number."""

    @abc.abstractmethod
    async def count_since(self, booking_id: uuid.UUID, since: datetime) -> int:
        """How many orders the booking placed from `since` on."""

    @abc.abstractmethod
    async def hold(self, booking_id: uuid.UUID) -> None:
        """Take the booking's order lock until the transaction ends."""

    @abc.abstractmethod
    async def recent_new(self, booking_id: uuid.UUID, since: datetime) -> list[GuestOrder]:
        """The booking's orders still new, placed from `since` on, with their items."""

    @abc.abstractmethod
    async def get(self, company_id: uuid.UUID, order_id: uuid.UUID) -> GuestOrder | None: ...

    @abc.abstractmethod
    async def list(self, company_id: uuid.UUID, *, status: OrderStatus | None = None) -> Sequence[GuestOrder]:
        """Newest first."""

    @abc.abstractmethod
    async def due_by_bookings(
        self, company_id: uuid.UUID, booking_ids: Sequence[uuid.UUID]
    ) -> dict[uuid.UUID, Decimal]:
        """What each booking's guest owes for orders delivered on the tab (on_booking)."""

    @abc.abstractmethod
    async def move(
        self, company_id: uuid.UUID, order_id: uuid.UUID, allowed: set[OrderStatus], order: GuestOrder
    ) -> GuestOrder | None:
        """Write the order's new status and stamps if it is still in one of `allowed`,
        in one step; None otherwise (another hand moved it first)."""
