"""The minibar's goods: one stock for the whole company, kept as a log of movements."""

from __future__ import annotations

import enum
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

# The ceiling of a Numeric(12, 2) column, as for payments.
MAX_MONEY = Decimal("9999999999.99")


class MovementKind(str, enum.Enum):
    PURCHASE = "purchase"  # + bought in; also an expense
    SALE = "sale"  # − delivered to a guest
    WRITEOFF = "writeoff"  # − broken, expired, drunk by the staff
    ADJUST = "adjust"  # ± a count that differs from the log


@dataclass
class Product:
    company_id: uuid.UUID
    name: str
    price: Decimal
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    category: str = ""
    description: str | None = None
    photo_url: str | None = None
    # An inactive product stays in the stock and leaves the guest's menu.
    is_active: bool = True
    sort_order: int = 0
    # Below this stock the product goes on the list of what to buy; None: no threshold.
    par_level: int | None = None
    created_at: datetime | None = None
    # Archived, never deleted: orders and the stock's log point at it.
    archived_at: datetime | None = None
    # The sum of its movements; filled by the repository on reading.
    stock: int = 0

    @property
    def to_buy(self) -> int:
        """How many are missing up to the threshold; 0 without one or at it."""
        return max(self.par_level - self.stock, 0) if self.par_level is not None else 0


@dataclass
class StockMovement:
    company_id: uuid.UUID
    product_id: uuid.UUID
    kind: MovementKind
    # Signed: + in, − out. Never 0.
    quantity: int
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    unit_cost: Decimal | None = None
    order_id: uuid.UUID | None = None
    expense_id: uuid.UUID | None = None
    note: str | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime | None = None
