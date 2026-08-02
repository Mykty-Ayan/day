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
    full_name: str = ""
    phone: str | None = None
    is_active: bool = True
    created_at: datetime | None = None


@dataclass
class ApiKey:
    """A service credential for bots and external integrations.

    The secret itself is never stored — only its hash and a short hint used to
    identify the key in a list.
    """

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = ""
    hashed_key: str = ""
    key_hint: str = ""
    scopes: list[str] = field(default_factory=list)
    created_by: uuid.UUID | None = None
    created_at: datetime | None = None
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None
