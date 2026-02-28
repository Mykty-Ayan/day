"""Shared API dependencies — JWT-based authentication."""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.domain.auth.value_objects import UserRole
from app.infrastructure.security import decode_token

_bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """Decode JWT and return the token payload as a dict with sub, company_id, role."""
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return payload


async def get_company_id(
    user: dict = Depends(get_current_user),
) -> uuid.UUID:
    """Extract company_id from the authenticated user's token."""
    return uuid.UUID(user["company_id"])


async def get_user_id(
    user: dict = Depends(get_current_user),
) -> uuid.UUID:
    """Extract user_id (sub) from the authenticated user's token."""
    return uuid.UUID(user["sub"])


def require_role(*roles: UserRole):
    """Dependency factory — raises 403 if the user's role is not in the allowed set."""

    async def _check(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in {r.value for r in roles}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return _check
