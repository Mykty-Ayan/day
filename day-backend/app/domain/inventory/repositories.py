from __future__ import annotations

import abc
import uuid
from collections.abc import Sequence

from app.domain.inventory.entities import Product, StockMovement


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
