from __future__ import annotations

import abc
import uuid
from collections.abc import Sequence

from app.domain.inventory.entities import Product


class ProductRepository(abc.ABC):
    @abc.abstractmethod
    async def add(self, product: Product) -> Product: ...

    @abc.abstractmethod
    async def get(self, company_id: uuid.UUID, product_id: uuid.UUID) -> Product | None:
        """The company's product; None for another company's."""

    @abc.abstractmethod
    async def list(self, company_id: uuid.UUID, *, include_archived: bool = False) -> Sequence[Product]:
        """In the menu's order."""

    @abc.abstractmethod
    async def save(self, product: Product) -> Product: ...

