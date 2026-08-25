from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class OnboardListingRequest(BaseModel):
    property_id: uuid.UUID
    currency: str = "KZT"
    country: str = "KZ"
    city: str = ""
    zip_code: str = ""
    timezone: str = "Asia/Almaty"
    contact_email: str = ""


class ListingResponse(BaseModel):
    id: uuid.UUID
    property_id: uuid.UUID
    channex_property_id: str
    channex_room_type_id: str
    channex_rate_plan_id: str
    sync_state: str
    last_error: str | None = None
    last_synced_at: datetime | None = None


class ListingListResponse(BaseModel):
    items: list[ListingResponse]


class PushAriRequest(BaseModel):
    date_from: date
    date_to: date
    rate: Decimal | None = Field(default=None, gt=0)
    min_stay: int | None = Field(default=None, ge=1)


class PushAriResponse(BaseModel):
    days_pushed: int
    blocked_dates: list[date]
