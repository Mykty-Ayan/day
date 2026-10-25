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
    # How many hours before check-in the guest's page shows the way in (codes,
    # Wi-Fi) once the stay is paid: by the night and by the hour.
    secrets_lead_hours_daily: int = 24
    secrets_lead_hours_hourly: int = 1
    created_at: datetime | None = None
    updated_at: datetime | None = None
