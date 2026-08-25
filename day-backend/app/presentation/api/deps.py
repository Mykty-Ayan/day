"""Shared API dependencies — authentication and permission checks.

Two credential kinds reach the API and both resolve to the same `Principal`:

* `Authorization: Bearer <jwt>` — a logged-in user; permissions come from role.
* `X-API-Key: day_sk_...` — a service key used by the bots and other external
  integrations; permissions are the scopes stored with the key.

Endpoints declare what they need with `Depends(require(Permission.X))` and never
inspect the credential kind themselves.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.auth.permissions import permissions_for_role
from app.domain.auth.value_objects import UserRole
from app.infrastructure.database import get_session
from app.infrastructure.repositories.auth import SqlApiKeyRepository, SqlUserRepository
from app.infrastructure.security import decode_token, hash_api_key

API_KEY_HEADER = "X-API-Key"

# auto_error=False so a request carrying only an API key is not rejected before
# we get a chance to look at that header.
_bearer = HTTPBearer(auto_error=False)

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Missing or invalid credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


@dataclass(frozen=True)
class Principal:
    """Whoever is making the request, normalized across credential kinds."""

    company_id: uuid.UUID
    permissions: frozenset[str]
    kind: Literal["user", "api_key"]
    user_id: uuid.UUID | None = None
    role: UserRole | None = None
    api_key_id: uuid.UUID | None = None
    # The user an action is attributed to in audit logs. For a service key this
    # is the operator who issued the key.
    actor_id: uuid.UUID | None = None

    def has(self, *permissions: str) -> bool:
        return all(permission in self.permissions for permission in permissions)


async def _principal_from_jwt(token: str, session: AsyncSession) -> Principal | None:
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None
    try:
        user_id = uuid.UUID(payload["sub"])
        company_id = uuid.UUID(payload["company_id"])
        role = UserRole(payload["role"])
    except (KeyError, ValueError):
        return None

    # The token is signed, but the account behind it may have been deactivated
    # since it was issued, so account state is re-checked on every request.
    user = await SqlUserRepository(session).get_by_id(user_id)
    if user is None or not user.is_active or user.company_id != company_id:
        return None

    return Principal(
        company_id=company_id,
        permissions=permissions_for_role(role),
        kind="user",
        user_id=user_id,
        role=role,
        actor_id=user_id,
    )


async def _principal_from_api_key(raw_key: str, session: AsyncSession) -> Principal | None:
    repo = SqlApiKeyRepository(session)
    api_key = await repo.get_by_hash(hash_api_key(raw_key))
    if api_key is None or not api_key.is_active:
        return None

    await repo.touch(api_key.id)
    return Principal(
        company_id=api_key.company_id,
        permissions=frozenset(api_key.scopes),
        kind="api_key",
        api_key_id=api_key.id,
        actor_id=api_key.created_by,
    )


async def get_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> Principal:
    api_key = request.headers.get(API_KEY_HEADER)
    if api_key:
        principal = await _principal_from_api_key(api_key, session)
        if principal is None:
            raise _UNAUTHENTICATED
        return principal

    if credentials is not None:
        principal = await _principal_from_jwt(credentials.credentials, session)
        if principal is None:
            raise _UNAUTHENTICATED
        return principal

    raise _UNAUTHENTICATED


async def get_current_user(principal: Principal = Depends(get_principal)) -> dict:
    """Back-compatible view of the caller for endpoints that want the raw claims."""
    return {
        "sub": str(principal.user_id) if principal.user_id else None,
        "company_id": str(principal.company_id),
        "role": principal.role.value if principal.role else None,
        "kind": principal.kind,
    }


async def get_company_id(principal: Principal = Depends(get_principal)) -> uuid.UUID:
    return principal.company_id


async def get_user_id(principal: Principal = Depends(get_principal)) -> uuid.UUID:
    """The user an action is attributed to.

    Service keys act on behalf of the operator who issued them, so bot-driven
    changes still land in the audit log against a real person.
    """
    if principal.actor_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This credential cannot perform actions that require a user",
        )
    return principal.actor_id


def require(*permissions: str):
    """Dependency factory — 403 unless the caller holds every listed permission."""

    async def _check(principal: Principal = Depends(get_principal)) -> Principal:
        if not principal.has(*permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return principal

    return _check


def require_role(*roles: UserRole):
    """Role-based variant, for endpoints that are about who you are.

    A service key carries no role, so it never satisfies this check — anything a
    bot must reach is guarded with `require` and explicit permissions instead.
    """

    async def _check(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.role not in set(roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return principal

    return _check
