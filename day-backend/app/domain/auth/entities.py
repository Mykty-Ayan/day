from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from app.domain.auth.value_objects import UserRole


@dataclass
class Company:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = ""
    created_at: datetime | None = None


@dataclass
class User:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    email: str = ""
    hashed_password: str = ""
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    role: UserRole = UserRole.OWNER
    is_active: bool = True
    created_at: datetime | None = None
