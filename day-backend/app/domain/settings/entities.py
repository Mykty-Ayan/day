from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, time

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
    # How a guest may pay for a minibar order: by a Kaspi invoice the host sends
    # before delivery, and/or added to the booking's bill. At least one is on.
    minibar_invoice: bool = True
    minibar_on_booking: bool = False
    # When the minibar takes orders, in the company's clock; both None: round the
    # clock. Closing before opening runs past midnight (10:00–02:00).
    minibar_opens: time | None = None
    minibar_closes: time | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def minibar_takes_orders(self, local: time) -> bool:
        """Whether an order may be placed at this local time."""
        opens, closes = self.minibar_opens, self.minibar_closes
        if opens is None or closes is None or opens == closes:
            return True
        if opens < closes:
            return opens <= local < closes
        return local >= opens or local < closes
