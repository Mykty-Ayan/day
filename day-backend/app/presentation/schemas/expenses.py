from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.expenses.entities import ExpenseCategory


class ExpenseCreate(BaseModel):
    category: ExpenseCategory
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    spent_on: date
    # Rent needs one; other expenses may be the whole company's.
    property_id: uuid.UUID | None = None
    payee: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=2000)


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})

    id: uuid.UUID
    category: ExpenseCategory
    amount: Decimal
    spent_on: date
    property_id: uuid.UUID | None = None
    payee: str | None = None
    note: str | None = None
    created_at: datetime | None = None
    voided_at: datetime | None = None
