from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field


class GuestOrderLine(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(..., ge=1, le=20)


class GuestOrderCreate(BaseModel):
    """From the guest's page: what and how many; the prices are the server's."""

    items: list[GuestOrderLine] = Field(..., min_length=1, max_length=30)
    note: str | None = Field(default=None, max_length=500)
    # The language of the WhatsApp text the page opens.
    language: Literal["ru", "kz", "en"] = "ru"


class GuestOrderPlaced(BaseModel):
    number: int
    total: float
    whatsapp_url: str | None = None
