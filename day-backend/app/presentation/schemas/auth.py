from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr

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
