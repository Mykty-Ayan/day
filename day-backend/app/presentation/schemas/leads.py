"""Wire shapes for leads and guest warnings."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class LeadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})

    id: uuid.UUID
    chat_id: str
    author: str
    #: What the colleague actually wrote. Every parsed field below is a guess,
    #: and the operator deciding on the lead should see the original.
    text: str
    district: str
    guests: int | None
    rooms_min: int | None
    rooms_max: int | None
    check_in: date | None
    nights: int | None
    budget: Decimal | None
    commission: bool
    status: str
    created_at: datetime | None


class LeadStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(new|answered|closed|expired)$")


class BlacklistEntryCreate(BaseModel):
    phone: str = Field(..., min_length=3, max_length=32)
    reason: str = Field(default="", max_length=1000)


class BlacklistEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    phone: str
    reason: str
    source: str
    created_at: datetime | None


class GuestCheckResponse(BaseModel):
    warned: bool
    #: Written for the operator. It never goes back to the guest: the groups
    #: these warnings come from remove people for passing their contents on.
    message: str
