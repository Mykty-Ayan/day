from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from app.domain.settings.value_objects import Currency, Language

# The zone a company runs on until it picks another.
DEFAULT_TIME_ZONE = "Asia/Almaty"


@dataclass
class CompanySettings:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    default_currency: Currency = Currency.KZT
    default_language: Language = Language.RU
    # IANA name of the clock that check-in and check-out times are local to.
    time_zone: str = DEFAULT_TIME_ZONE
    created_at: datetime | None = None
    updated_at: datetime | None = None
