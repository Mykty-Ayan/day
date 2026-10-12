"""Signing out, a role change, a deactivation or a new password end every open session."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.application.auth.user_service import UserManagementService
from app.config import settings
from app.domain.auth.entities import User
from app.domain.auth.value_objects import UserRole
from tests.test_auth_permissions import COMPANY_ID, FakeUserRepository


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "change",
    [
        {"role": UserRole.MANAGER},
        {"is_active": False},
        {"password": "brand-new-pass"},
    ],
)
async def test_a_change_of_access_ends_the_users_sessions(change):
    user = User(company_id=COMPANY_ID, email="c@c.com", role=UserRole.CLEANER)
    updated = await UserManagementService(FakeUserRepository([user])).update(user.id, COMPANY_ID, **change)
    assert updated.token_version == 1


@pytest.mark.asyncio
async def test_a_new_name_keeps_the_sessions():
    user = User(company_id=COMPANY_ID, email="c@c.com", role=UserRole.CLEANER)
    updated = await UserManagementService(FakeUserRepository([user])).update(user.id, COMPANY_ID, full_name="Maria")
    assert updated.token_version == 0


# ---------- through the API, against the database ----------


@pytest.fixture
async def api():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.infrastructure.database import get_session
    from app.main import app

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def _session():
        async with maker() as session:
            yield session

    app.dependency_overrides[get_session] = _session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_session, None)
        await engine.dispose()


async def _register(client) -> tuple[dict, str]:
    email = f"revoke-{uuid.uuid4().hex[:10]}@example.com"
    response = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "long-enough-pass", "company_name": "Revoke"}
    )
    assert response.status_code == 201, response.text
    return response.json(), email


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.integration
async def test_logout_ends_the_access_and_the_refresh_token(api):
    tokens, email = await _register(api)
    assert (await api.get("/api/v1/auth/me", headers=_bearer(tokens["access_token"]))).status_code == 200

    assert (await api.post("/api/v1/auth/logout", headers=_bearer(tokens["access_token"]))).status_code == 204

    assert (await api.get("/api/v1/auth/me", headers=_bearer(tokens["access_token"]))).status_code == 401
    refreshed = await api.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 401

    again = await api.post("/api/v1/auth/login", json={"email": email, "password": "long-enough-pass"})
    assert (await api.get("/api/v1/auth/me", headers=_bearer(again.json()["access_token"]))).status_code == 200


@pytest.mark.integration
async def test_a_token_from_before_versions_still_works_until_the_first_revocation(api):
    # Tokens issued by the previous release carry no "tv": they count as
    # version 0, so a deploy does not sign everybody out.
    tokens, _ = await _register(api)
    claims = jwt.decode(tokens["access_token"], settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    claims.pop("tv")
    claims["exp"] = datetime.now(timezone.utc) + timedelta(minutes=5)
    legacy = jwt.encode(claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    assert (await api.get("/api/v1/auth/me", headers=_bearer(legacy))).status_code == 200
