"""An agent: a person who brings guests to the company for a cut."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Agent:
    company_id: uuid.UUID
    name: str
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    phone: str | None = None
    note: str | None = None
    # One who stopped bringing guests stays on the bookings they brought.
    is_active: bool = True
    created_at: datetime | None = None
