from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.domain.auth.value_objects import UserRole


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    company_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    company_id: uuid.UUID
    role: UserRole
    is_active: bool
    full_name: str = ""
    phone: str | None = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    role: UserRole
    full_name: str = ""
    phone: str | None = None


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8)


class ApiKeyResponse(BaseModel):
    id: uuid.UUID
    name: str
    key_hint: str
    scopes: list[str]
    created_at: datetime | None = None
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None
    is_active: bool


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    scopes: list[str] = Field(min_length=1)


class ApiKeyCreatedResponse(ApiKeyResponse):
    """Returned only at creation time — the one moment the secret is available."""

    key: str
