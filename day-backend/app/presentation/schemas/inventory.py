from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.inventory.entities import MAX_MONEY


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
    archived_at: datetime | None = None

