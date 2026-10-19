from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.expenses.entities import ExpenseCategory


class ExpenseCreate(BaseModel):
    category: ExpenseCategory
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    spent_on: date
    # Rent needs one; other expenses may be the whole company's.
    property_id: uuid.UUID | None = None
    payee: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("spent_on")
    @classmethod
    def _near_today(cls, value: date) -> date:
        # A typo in the year would bend a month's profit; the books go back two years.
        today = date.today()
        if not (today - timedelta(days=731) <= value <= today + timedelta(days=366)):
            raise ValueError("The day must be within two years back and a year ahead")
        return value


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
