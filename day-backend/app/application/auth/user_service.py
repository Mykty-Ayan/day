"""Team management — the owner creates and maintains the company's accounts.

Registration only ever produces a company plus its owner, so this is the single
path by which a manager or a cleaner comes into existence.
"""

from __future__ import annotations

import uuid

from app.domain.auth.entities import User
from app.domain.auth.repositories import UserRepository
from app.domain.auth.value_objects import UserRole
from app.infrastructure.security import hash_password

MIN_PASSWORD_LENGTH = 8


class UserManagementService:
    def __init__(self, user_repo: UserRepository) -> None:
        self._repo = user_repo

    async def create(
        self,
        company_id: uuid.UUID,
        email: str,
        password: str,
        role: UserRole,
        full_name: str = "",
        phone: str | None = None,
    ) -> User:
        email = email.strip().lower()
        if not email:
            raise ValueError("Email is required")
        if len(password) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")

        # Email is globally unique — a person belongs to exactly one company.
        if await self._repo.get_by_email(email) is not None:
            raise ValueError("Email already registered")

        user = User(
            email=email,
            hashed_password=hash_password(password),
            company_id=company_id,
            role=role,
            full_name=full_name.strip(),
            phone=phone,
        )
        return await self._repo.save(user)

    async def list(
        self,
        company_id: uuid.UUID,
        *,
        role: UserRole | None = None,
        include_inactive: bool = True,
    ) -> list[User]:
        return await self._repo.list_by_company(company_id, role=role, include_inactive=include_inactive)

    async def update(
        self,
        user_id: uuid.UUID,
        company_id: uuid.UUID,
        *,
        full_name: str | None = None,
        phone: str | None = None,
        role: UserRole | None = None,
        is_active: bool | None = None,
        password: str | None = None,
        acting_user_id: uuid.UUID | None = None,
    ) -> User:
        user = await self._get_own(user_id, company_id)

        if role is not None and role != user.role:
            self._guard_self_demotion(user, acting_user_id, "role")
            user.role = role
        if is_active is not None and is_active != user.is_active:
            self._guard_self_demotion(user, acting_user_id, "active state")
            user.is_active = is_active
        if full_name is not None:
            user.full_name = full_name.strip()
        if phone is not None:
            user.phone = phone or None
        if password is not None:
            if len(password) < MIN_PASSWORD_LENGTH:
                raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
            user.hashed_password = hash_password(password)

        return await self._repo.update(user)

    async def deactivate(
        self,
        user_id: uuid.UUID,
        company_id: uuid.UUID,
        acting_user_id: uuid.UUID | None = None,
    ) -> User:
        return await self.update(
            user_id,
            company_id,
            is_active=False,
            acting_user_id=acting_user_id,
        )

    async def _get_own(self, user_id: uuid.UUID, company_id: uuid.UUID) -> User:
        user = await self._repo.get_by_id(user_id)
        if user is None or user.company_id != company_id:
            raise ValueError("User not found")
        return user

    @staticmethod
    def _guard_self_demotion(user: User, acting_user_id: uuid.UUID | None, what: str) -> None:
        """Stop an owner locking themselves out of their own company."""
        if acting_user_id is not None and user.id == acting_user_id:
            raise ValueError(f"You cannot change your own {what}")
