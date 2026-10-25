"""The minibar's goods: one catalogue for the whole company."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

# The ceiling of a Numeric(12, 2) column, as for payments.
MAX_MONEY = Decimal("9999999999.99")


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

