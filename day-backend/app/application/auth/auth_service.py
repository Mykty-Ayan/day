from __future__ import annotations

import uuid

from app.application.auth.user_service import MIN_PASSWORD_LENGTH
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


def issue_tokens(user: User) -> dict:
    return {
        "access_token": create_access_token(user.id, user.company_id, user.role.value, user.token_version),
        "refresh_token": create_refresh_token(user.id, user.company_id, user.role.value, user.token_version),
        "token_type": "bearer",
    }


def token_is_current(payload: dict, user: User) -> bool:
    """A token from before the last sign-out, role change or new password is void.

    Tokens issued before versions existed carry no "tv" and count as 0.
    """
    return payload.get("tv", 0) == user.token_version


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

        return issue_tokens(user)

    async def login(self, email: str, password: str) -> dict:
        user = await self._user_repo.get_by_email(email)
        if not user or not verify_password(password, user.hashed_password):
            raise ValueError("Invalid email or password")
        if not user.is_active:
            raise ValueError("Account is disabled")

        return issue_tokens(user)

    async def refresh(self, refresh_token: str) -> dict:
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise ValueError("Invalid refresh token")

        user_id = uuid.UUID(payload["sub"])
        user = await self._user_repo.get_by_id(user_id)
        if not user or not user.is_active or not token_is_current(payload, user):
            raise ValueError("Invalid refresh token")

        return issue_tokens(user)

    async def change_password(self, user_id: uuid.UUID, current_password: str, new_password: str) -> dict:
        """Set a new password, end every other session, keep this one going."""
        # Locked: a second change racing this one waits, then finds the
        # current password already replaced and is refused.
        user = await self._user_repo.get_for_update(user_id)
        if user is None or not user.is_active:
            raise ValueError("User not found")
        if not verify_password(current_password, user.hashed_password):
            raise ValueError("Current password is wrong")
        if len(new_password) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        user.hashed_password = hash_password(new_password)
        await self._user_repo.update(user)
        user = await self._user_repo.bump_token_version(user_id)
        return issue_tokens(user)

    async def logout_by_refresh_token(self, refresh_token: str) -> None:
        """Sign the user out everywhere. Quietly does nothing for a token that is
        invalid or already revoked: there is no session left to end."""
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            return
        user = await self._user_repo.get_by_id(uuid.UUID(payload["sub"]))
        if user is None or not token_is_current(payload, user):
            return
        await self._user_repo.bump_token_version(user.id)

    async def get_current_user(self, user_id: uuid.UUID) -> User | None:
        return await self._user_repo.get_by_id(user_id)
