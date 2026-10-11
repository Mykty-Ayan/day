from __future__ import annotations

import uuid
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, field_validator

from app.domain.settings.value_objects import Currency, Language


class SettingsUpdate(BaseModel):
    default_currency: Currency | None = None
    default_language: Language | None = None
    # IANA name, e.g. "Asia/Almaty"; offsets like "+05:00" do not follow DST rules.
    time_zone: str | None = None

    @field_validator("time_zone")
    @classmethod
    def _iana(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if "/" not in value:  # rejects "UTC+5", "+05:00" and the bare abbreviations
            raise ValueError("time_zone must be an IANA name such as Asia/Almaty")
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("time_zone must be an IANA name such as Asia/Almaty") from exc
        return value


class SettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    default_currency: Currency
    default_language: Language
    time_zone: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
