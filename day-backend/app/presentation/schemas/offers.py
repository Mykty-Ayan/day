"""A personal link for a guest, made by aidyn (the CRM) or the operator."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator


def full_phone(value: str) -> str:
    # E.164 holds up to 15 digits; fewer than 10 is no full number anywhere.
    if not 10 <= sum(ch.isdigit() for ch in value) <= 15:
        raise ValueError("A phone holds 10 to 15 digits")
    return value


class OfferCreate(BaseModel):
    guest_name: str = Field(min_length=1, max_length=255)
    guest_phone: str = Field(min_length=5, max_length=50)
    check_in: date
    check_out: date
    guests: int = Field(ge=1, le=50)
    property_ids: list[uuid.UUID] = Field(min_length=1, max_length=10)

    @field_validator("guest_phone")
    @classmethod
    def _a_phone_number(cls, value: str) -> str:
        return full_phone(value)

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
