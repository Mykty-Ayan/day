from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.inventory.entities import MAX_MONEY, MovementKind


class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    category: str = Field(default="", max_length=40)
    description: str | None = Field(default=None, max_length=2000)
    price: Decimal = Field(..., ge=0, le=MAX_MONEY, max_digits=12, decimal_places=2)
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0, le=10_000)
    # Below it the product goes on the list of what to buy; null: no threshold.
    par_level: int | None = Field(default=None, ge=0, le=100_000)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = Field(default=None, max_length=40)
    description: str | None = Field(default=None, max_length=2000)
    price: Decimal | None = Field(default=None, ge=0, le=MAX_MONEY, max_digits=12, decimal_places=2)
    is_active: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=10_000)
    # null removes the threshold.
    par_level: int | None = Field(default=None, ge=0, le=100_000)


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})

    id: uuid.UUID
    name: str
    category: str
    description: str | None = None
    photo_url: str | None = None
    price: Decimal
    is_active: bool
    sort_order: int
    par_level: int | None = None
    stock: int
    # Missing up to par_level: what the list of what to buy says.
    to_buy: int = 0
    archived_at: datetime | None = None


class MovementCreate(BaseModel):
    # A sale comes from a delivered order, never from here.
    kind: Literal["purchase", "writeoff", "adjust"]
    quantity: int = Field(..., ge=-100_000, le=100_000)
    unit_cost: Decimal | None = Field(default=None, ge=0, le=MAX_MONEY, max_digits=12, decimal_places=2)
    spent_on: date | None = None
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("spent_on")
    @classmethod
    def _near_today(cls, value: date | None) -> date | None:
        # The same window as an expense: the purchase becomes one.
        today = date.today()
        if value is not None and not (today - timedelta(days=731) <= value <= today + timedelta(days=366)):
            raise ValueError("The day must be within two years back and a year ahead")
        return value


class MovementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})

    id: uuid.UUID
    product_id: uuid.UUID
    kind: MovementKind
    quantity: int
    unit_cost: Decimal | None = None
    order_id: uuid.UUID | None = None
    expense_id: uuid.UUID | None = None
    note: str | None = None
    created_at: datetime | None = None
