from __future__ import annotations

import uuid

from app.domain.auth.entities import Company, User
from app.domain.auth.repositories import CompanyRepository, UserRepository
from app.domain.auth.value_objects import UserRole
from app.infrastructure.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


class AuthService:
    def __init__(self, user_repo: UserRepository, company_repo: CompanyRepository) -> None:
        self._user_repo = user_repo
        self._company_repo = company_repo

    async def register(self, email: str, password: str, company_name: str) -> dict:
        existing = await self._user_repo.get_by_email(email)
        if existing:
            raise ValueError("Email already registered")

        company = Company(name=company_name)
        company = await self._company_repo.save(company)

        user = User(
            email=email,
            hashed_password=hash_password(password),
            company_id=company.id,
            role=UserRole.OWNER,
        )
        user = await self._user_repo.save(user)

        return {
            "access_token": create_access_token(user.id, user.company_id, user.role.value),
            "refresh_token": create_refresh_token(user.id, user.company_id, user.role.value),
            "token_type": "bearer",
        }

    async def login(self, email: str, password: str) -> dict:
        user = await self._user_repo.get_by_email(email)
        if not user or not verify_password(password, user.hashed_password):
            raise ValueError("Invalid email or password")
        if not user.is_active:
            raise ValueError("Account is disabled")

        return {
            "access_token": create_access_token(user.id, user.company_id, user.role.value),
            "refresh_token": create_refresh_token(user.id, user.company_id, user.role.value),
            "token_type": "bearer",
        }

    async def refresh(self, refresh_token: str) -> dict:
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise ValueError("Invalid refresh token")

        user_id = uuid.UUID(payload["sub"])
        user = await self._user_repo.get_by_id(user_id)
        if not user or not user.is_active:
            raise ValueError("Invalid refresh token")

        return {
            "access_token": create_access_token(user.id, user.company_id, user.role.value),
            "refresh_token": create_refresh_token(user.id, user.company_id, user.role.value),
            "token_type": "bearer",
        }

    async def get_current_user(self, user_id: uuid.UUID) -> User | None:
        return await self._user_repo.get_by_id(user_id)
