"""The minibar's stock: the catalogue, purchases, write-offs and counts.

A purchase is money out as well, so it lands in the expenses too: the books see
what the minibar cost without anyone typing it twice.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from app.domain.expenses.entities import Expense, ExpenseCategory
from app.domain.expenses.repositories import ExpenseRepository
from app.domain.inventory.entities import MAX_MONEY, MovementKind, Product, StockMovement
from app.domain.inventory.repositories import ProductRepository, StockMovementRepository

# More in one go is a typo in the count, not a delivery.
MAX_QUANTITY = 100_000
_EDITABLE = ("name", "category", "description", "price", "is_active", "sort_order", "par_level")


@dataclass
class NewMovement:
    company_id: uuid.UUID
    product_id: uuid.UUID
    kind: MovementKind
    # Purchase and write-off: how many, above zero. Adjust: signed, never zero.
    quantity: int
    created_by: uuid.UUID | None
    unit_cost: Decimal | None = None
    # The day the purchase was paid, for the expense.
    spent_on: date | None = None
    note: str | None = None


class ManageStockService:
    def __init__(
        self, products: ProductRepository, movements: StockMovementRepository, expenses: ExpenseRepository
    ) -> None:
        self._products = products
        self._movements = movements
        self._expenses = expenses

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

    async def history(self, company_id: uuid.UUID, product_id: uuid.UUID) -> Sequence[StockMovement]:
        await self._get(company_id, product_id)
        return await self._movements.list_for_product(company_id, product_id)

    async def record(self, new: NewMovement) -> StockMovement:
        """A purchase, a write-off or a count. Sales come from delivered orders only."""
        product = await self._get(new.company_id, new.product_id)
        note = (new.note or "").strip() or None
        if new.kind == MovementKind.SALE:
            raise ValueError("A sale is recorded by delivering a guest's order")
        if new.kind == MovementKind.ADJUST:
            if new.quantity == 0 or abs(new.quantity) > MAX_QUANTITY:
                raise ValueError(f"A count changes the stock by 1 to {MAX_QUANTITY} either way")
        elif not 0 < new.quantity <= MAX_QUANTITY:
            raise ValueError(f"The quantity must be from 1 to {MAX_QUANTITY}")
        if new.kind != MovementKind.PURCHASE and note is None:
            raise ValueError("Say why the stock changes")

        quantity, expense_id, unit_cost = new.quantity, None, None
        if new.kind == MovementKind.WRITEOFF:
            quantity = -new.quantity
        if new.kind == MovementKind.PURCHASE:
            if product.archived_at is not None:
                raise ValueError("The product is archived")
            if new.unit_cost is None or not 0 <= new.unit_cost <= MAX_MONEY:
                raise ValueError("Give the purchase price of one piece")
            unit_cost = new.unit_cost
            total = unit_cost * new.quantity
            if total > MAX_MONEY:
                raise ValueError("The purchase total is too large")
            # A free delivery (samples) moves the stock and costs nothing.
            if total > 0:
                expense = await self._expenses.add(
                    Expense(
                        company_id=new.company_id,
                        category=ExpenseCategory.MINIBAR,
                        amount=total,
                        spent_on=new.spent_on or date.today(),
                        note=f"{product.name} × {new.quantity}" + (f". {note}" if note else ""),
                        created_by=new.created_by,
                    )
                )
                expense_id = expense.id
        return await self._movements.add(
            StockMovement(
                company_id=new.company_id,
                product_id=product.id,
                kind=new.kind,
                quantity=quantity,
                unit_cost=unit_cost,
                expense_id=expense_id,
                note=note,
                created_by=new.created_by,
            )
        )

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
    if product.par_level is not None and not 0 <= product.par_level <= 100_000:
        raise ValueError("The threshold must be from 0 to 100 000")
