from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AgentCreate(BaseModel):
    name: str = Field(..., max_length=200)
    phone: str | None = Field(default=None, max_length=32)
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def _named(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("An agent has a name")
        return value.strip()


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=32)
    note: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _named(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("An agent has a name")
        return value.strip() if value is not None else None


class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    phone: str | None = None
    note: str | None = None
    is_active: bool
    created_at: datetime | None = None
