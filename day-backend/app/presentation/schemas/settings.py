from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.domain.settings.value_objects import Currency, Language


class SettingsUpdate(BaseModel):
    default_currency: Currency | None = None
    default_language: Language | None = None


class SettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    default_currency: Currency
    default_language: Language
    created_at: datetime | None = None
    updated_at: datetime | None = None
