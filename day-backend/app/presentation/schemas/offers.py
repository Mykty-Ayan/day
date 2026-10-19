"""A personal link for a guest, made by aidyn (the CRM) or the operator."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


def full_phone(value: str) -> str:
    # E.164 holds up to 15 digits; fewer than 10 is no full number anywhere.
    if not 10 <= sum(ch.isdigit() for ch in value) <= 15:
        raise ValueError("A phone holds 10 to 15 digits")
    return value


class OfferCreate(BaseModel):
    guest_name: str = Field(min_length=1, max_length=255)
    guest_phone: str = Field(min_length=5, max_length=50)
    # By the night: check_in and check_out. By the hour: starts_at and ends_at, the
    # company's local time without a zone, as a booking's times; up to 24 hours.
    rental_mode: Literal["daily", "hourly"] = "daily"
    check_in: date | None = None
    check_out: date | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    guests: int = Field(ge=1, le=50)
    property_ids: list[uuid.UUID] = Field(min_length=1, max_length=10)
    # The asking system's id (the CRM's conversation). The booking made by the link
    # carries it as its external_id, in GET /bookings/feed too. Never shown to the guest.
    external_id: str | None = Field(default=None, max_length=255)

    @field_validator("guest_phone")
    @classmethod
    def _a_phone_number(cls, value: str) -> str:
        return full_phone(value)

    @model_validator(mode="after")
    def _the_stay_of_its_kind(self):
        if self.rental_mode == "hourly":
            if self.starts_at is None or self.ends_at is None:
                raise ValueError("An hourly offer needs starts_at and ends_at")
            if self.starts_at.tzinfo is not None or self.ends_at.tzinfo is not None:
                raise ValueError("starts_at and ends_at are the company's local time, without a zone")
            if self.ends_at <= self.starts_at:
                raise ValueError("ends_at must be after starts_at")
        else:
            if self.check_in is None or self.check_out is None:
                raise ValueError("A nightly offer needs check_in and check_out")
            if self.check_out <= self.check_in:
                raise ValueError("check_out must be after check_in")
        return self


class OfferResponse(BaseModel):
    code: str
    # The link to send the guest.
    url: str
    rental_mode: str
    # For an hourly offer check_in is the stay's day; starts_at and ends_at are its hours.
    check_in: date
    check_out: date
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    property_ids: list[uuid.UUID]
    external_id: str | None = None
