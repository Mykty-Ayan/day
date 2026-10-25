from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.inventory.entities import OrderPayment, OrderStatus


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


class GuestOrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})

    product_id: uuid.UUID
    name: str
    price: Decimal
    quantity: int


class GuestOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})

    id: uuid.UUID
    number: int
    status: OrderStatus
    total: Decimal
    guest_note: str | None = None
    payment_method: OrderPayment | None = None
    booking_id: uuid.UUID
    property_id: uuid.UUID
    property_name: str | None = None
    guest_name: str | None = None
    created_at: datetime | None = None
    accepted_at: datetime | None = None
    delivered_at: datetime | None = None
    cancelled_at: datetime | None = None
    items: list[GuestOrderItemResponse]


class GuestOrderDeliver(BaseModel):
    payment_method: OrderPayment
