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


# ---------- the Mini App's Telegram blob ----------


@pytest.mark.asyncio
@pytest.mark.parametrize(("signed_minutes_ago", "ended"), [(10, True), (0, False)])
async def test_a_telegram_blob_from_before_the_sign_out_is_refused(signed_minutes_ago, ended):
    import time

    from app.application.auth.telegram_login import TelegramLoginService, TelegramSessionEnded
    from app.domain.messaging.entities import ChannelIdentity
    from app.domain.messaging.value_objects import Channel
    from app.infrastructure.telegram_init_data import TelegramUser
    from tests.test_messaging import FakeIdentityRepository

    user = User(company_id=COMPANY_ID, email="o@c.com", role=UserRole.OWNER)
    user.tokens_revoked_at = datetime.utcnow() - timedelta(minutes=5)
    identity = ChannelIdentity(company_id=COMPANY_ID, channel=Channel.TELEGRAM, external_id="42", user_id=user.id)
    svc = TelegramLoginService(FakeIdentityRepository([identity]), FakeUserRepository([user]))
    blob = TelegramUser(id=42, auth_date=int(time.time()) - signed_minutes_ago * 60)

    if ended:
        with pytest.raises(TelegramSessionEnded):
            await svc.issue_tokens(blob)
    else:
        assert "access_token" in await svc.issue_tokens(blob)


@pytest.mark.integration
async def test_an_edit_racing_a_sign_out_cannot_bring_the_old_tokens_back(api):
    # The edit used to write back the version it had read before the sign-out.
    import asyncio

    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.application.auth.auth_service import AuthService
    from app.infrastructure.repositories.auth import SqlUserRepository
    from app.infrastructure.security import decode_token

    tokens, _ = await _register(api)
    claims = decode_token(tokens["access_token"])
    user_id, company_id = uuid.UUID(claims["sub"]), uuid.UUID(claims["company_id"])

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def rename():
        async with maker() as s:
            await UserManagementService(SqlUserRepository(s)).update(user_id, company_id, full_name="Renamed")
            await asyncio.sleep(0.05)  # hold the lock while the sign-out arrives
            await s.commit()

    async def sign_out():
        await asyncio.sleep(0.01)
        async with maker() as s:
            await AuthService(SqlUserRepository(s), None).logout_everywhere(user_id)
            await s.commit()

    try:
        await asyncio.gather(rename(), sign_out())
        async with maker() as s:
            stored = await SqlUserRepository(s).get_by_id(user_id)
        assert stored.token_version == 1 and stored.full_name == "Renamed"
        assert (await api.get("/api/v1/auth/me", headers=_bearer(tokens["access_token"]))).status_code == 401
    finally:
        await engine.dispose()
