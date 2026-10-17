"""A personal link for a guest, made by aidyn (the CRM) or the operator."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field, model_validator


class OfferCreate(BaseModel):
    guest_name: str = Field(min_length=1, max_length=255)
    guest_phone: str = Field(min_length=5, max_length=50)
    check_in: date
    check_out: date
    guests: int = Field(ge=1, le=50)
    property_ids: list[uuid.UUID] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def _at_least_one_night(self):
        if self.check_out <= self.check_in:
            raise ValueError("check_out must be after check_in")
        return self


class OfferResponse(BaseModel):
    code: str
    # The link to send the guest.
    url: str
    check_in: date
    check_out: date
    property_ids: list[uuid.UUID]
