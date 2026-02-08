"""Shared API dependencies."""

from __future__ import annotations

import uuid

from fastapi import Header

# TODO: Replace with proper JWT auth dependency when Phase 1 auth is implemented.
# For now, company_id comes from a request header for development.

_DEFAULT_COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


async def get_company_id(
    x_company_id: str | None = Header(default=None),
) -> uuid.UUID:
    """Extract company_id from X-Company-ID header or use a default."""
    if x_company_id:
        return uuid.UUID(x_company_id)
    return _DEFAULT_COMPANY_ID


async def get_user_id(
    x_user_id: str | None = Header(default=None),
) -> uuid.UUID | None:
    """Extract user_id from X-User-ID header (optional, for audit)."""
    if x_user_id:
        return uuid.UUID(x_user_id)
    return None
