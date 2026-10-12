"""Optional two-factor sign-in: after the password, a code from the user's own Telegram chat."""

import pytest

from app.application.auth.two_factor import TwoFactorService
from app.domain.auth.entities import User
from app.domain.auth.value_objects import UserRole
from app.domain.messaging.entities import ChannelIdentity
from app.domain.messaging.value_objects import Channel
from app.infrastructure.security import decode_token, hash_password
from tests.test_auth_permissions import COMPANY_ID, FakeUserRepository
from tests.test_messaging import FakeIdentityRepository
from tests.test_password_reset import FakeStore, _Background, _code, _Telegram


def _setup(*, chat="489615644", enabled=True):
    user = User(
        company_id=COMPANY_ID,
        email="owner@example.com",
        role=UserRole.OWNER,
        hashed_password=hash_password("right-pass-1"),
    )
    user.two_factor_enabled = enabled
    identities = (
        [ChannelIdentity(company_id=COMPANY_ID, channel=Channel.TELEGRAM, external_id=chat, user_id=user.id)]
        if chat
        else []
    )
    users, telegram, background = FakeUserRepository([user]), _Telegram(), _Background()
    svc = TwoFactorService(users, FakeIdentityRepository(identities), FakeStore(), telegram, spawn=background.append)
    return svc, users, telegram, user, background


@pytest.mark.asyncio
async def test_the_code_goes_to_the_chat_and_the_challenge_turns_into_tokens():
    svc, _, telegram, user, background = _setup()
    challenge = await svc.start(user)
    await background.drain()
    assert telegram.sent[0][0] == "489615644"
    assert "access_token" not in decode_token(challenge)  # a challenge is not a session

    tokens = await svc.verify(challenge, _code(telegram))
    assert decode_token(tokens["access_token"])["sub"] == str(user.id)


@pytest.mark.asyncio
async def test_a_wrong_code_or_a_forged_challenge_gets_nothing():
    svc, _, telegram, user, background = _setup()
    challenge = await svc.start(user)
    await background.drain()
    wrong = "000000" if _code(telegram) != "000000" else "111111"
    with pytest.raises(ValueError, match="wrong or expired"):
        await svc.verify(challenge, wrong)
    with pytest.raises(ValueError, match="wrong or expired"):
        await svc.verify("not-a-token", _code(telegram))


@pytest.mark.asyncio
async def test_an_access_token_is_not_a_challenge():
    from app.application.auth.auth_service import issue_tokens

    svc, _, telegram, user, background = _setup()
    await svc.start(user)
    await background.drain()
    with pytest.raises(ValueError, match="wrong or expired"):
        await svc.verify(issue_tokens(user)["access_token"], _code(telegram))


@pytest.mark.asyncio
async def test_a_challenge_dies_with_the_sessions():
    svc, users, telegram, user, background = _setup()
    challenge = await svc.start(user)
    await background.drain()
    await users.bump_token_version(user.id)
    with pytest.raises(ValueError, match="wrong or expired"):
        await svc.verify(challenge, _code(telegram))


@pytest.mark.asyncio
async def test_without_a_private_chat_the_sign_in_says_how_to_fix_it():
    svc, _, telegram, user, _ = _setup(chat=None)
    with pytest.raises(ValueError, match="Telegram"):
        await svc.start(user)
    assert telegram.sent == []


@pytest.mark.asyncio
async def test_turning_it_on_needs_the_password_and_a_linked_chat():
    svc, users, _, user, _ = _setup(enabled=False)
    with pytest.raises(ValueError, match="Password is wrong"):
        await svc.set_enabled(user.id, "guess", True)
    assert (await svc.set_enabled(user.id, "right-pass-1", True)).two_factor_enabled is True

    svc, _, _, user, _ = _setup(chat=None, enabled=False)
    with pytest.raises(ValueError, match="Telegram"):
        await svc.set_enabled(user.id, "right-pass-1", True)


@pytest.mark.asyncio
async def test_turning_it_off_needs_the_password():
    svc, _, _, user, _ = _setup()
    with pytest.raises(ValueError, match="Password is wrong"):
        await svc.set_enabled(user.id, "guess", False)
    assert (await svc.set_enabled(user.id, "right-pass-1", False)).two_factor_enabled is False


@pytest.mark.integration
async def test_sign_in_with_a_telegram_code_through_the_api(monkeypatch):
    import asyncio
    import uuid

    from httpx import ASGITransport, AsyncClient
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.config import settings
    from app.infrastructure.database import get_session
    from app.infrastructure.models.messaging import ChannelIdentityModel
    from app.main import app
    from app.presentation.api.v1 import auth as auth_api

    store, telegram = FakeStore(), _Telegram()
    monkeypatch.setattr(auth_api, "get_redis", lambda: store)
    monkeypatch.setattr(auth_api, "get_provider", lambda channel: telegram)
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def _session():
        async with maker() as session:
            yield session

    app.dependency_overrides[get_session] = _session
    email = f"tfa-{uuid.uuid4().hex[:10]}@example.com"
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            tokens = (
                await client.post(
                    "/api/v1/auth/register", json={"email": email, "password": "right-pass-1", "company_name": "2FA"}
                )
            ).json()
            bearer = {"Authorization": f"Bearer {tokens['access_token']}"}
            on = {"enabled": True, "password": "right-pass-1"}
            refused = await client.post("/api/v1/auth/two-factor", json=on, headers=bearer)
            assert refused.status_code == 400 and "Telegram" in refused.json()["detail"]

            me = (await client.get("/api/v1/auth/me", headers=bearer)).json()
            async with maker() as s:
                s.add(
                    ChannelIdentityModel(
                        company_id=uuid.UUID(me["company_id"]),
                        channel="telegram",
                        external_id=str(uuid.uuid4().int)[:12],
                        user_id=uuid.UUID(me["id"]),
                        is_active=True,
                    )
                )
                await s.commit()

            enabled = (await client.post("/api/v1/auth/two-factor", json=on, headers=bearer)).json()
            assert enabled["two_factor_enabled"] is True and enabled["telegram_linked"] is True

            first = (await client.post("/api/v1/auth/login", json={"email": email, "password": "right-pass-1"})).json()
            assert first["two_factor_required"] is True and first["access_token"] is None
            await asyncio.sleep(0.2)  # the code goes out after the answer
            code = _code(telegram)

            verified = await client.post(
                "/api/v1/auth/login/verify", json={"challenge": first["challenge"], "code": code}
            )
            assert verified.status_code == 200
            me = await client.get(
                "/api/v1/auth/me", headers={"Authorization": f"Bearer {verified.json()['access_token']}"}
            )
            assert me.status_code == 200
    finally:
        app.dependency_overrides.pop(get_session, None)
        await engine.dispose()


# ---------- the chat a two-factor sign-in depends on ----------


def _linked(two_factor: bool, extra_chat: str | None = None):
    from app.application.messaging.link_channel import LinkChannelService
    from tests.test_messaging import FakeLinkCodeRepository

    user = User(company_id=COMPANY_ID, email="owner@example.com", role=UserRole.OWNER)
    user.two_factor_enabled = two_factor
    chats = [ChannelIdentity(company_id=COMPANY_ID, channel=Channel.TELEGRAM, external_id="489615644", user_id=user.id)]
    if extra_chat:
        chats.append(
            ChannelIdentity(company_id=COMPANY_ID, channel=Channel.TELEGRAM, external_id=extra_chat, user_id=user.id)
        )
    identities = FakeIdentityRepository(chats)
    link = LinkChannelService(FakeLinkCodeRepository(), identities, FakeUserRepository([user]))
    return link, identities, user


@pytest.mark.asyncio
async def test_the_last_chat_of_a_two_factor_user_cannot_be_unlinked():
    from app.application.messaging.link_channel import StrandsTwoFactor

    link, identities, _ = _linked(two_factor=True)
    with pytest.raises(StrandsTwoFactor):
        await link.unlink(Channel.TELEGRAM, "489615644")
    assert identities.identities[0].is_active is True


@pytest.mark.asyncio
@pytest.mark.parametrize(("two_factor", "extra_chat"), [(False, None), (True, "555")])
async def test_a_chat_unlinks_when_sign_in_does_not_depend_on_it(two_factor, extra_chat):
    link, identities, _ = _linked(two_factor=two_factor, extra_chat=extra_chat)
    await link.unlink(Channel.TELEGRAM, "489615644")
    assert identities.identities[0].is_active is False


@pytest.mark.asyncio
async def test_the_last_chat_of_a_two_factor_user_cannot_be_moved_to_someone_else():
    import uuid as _uuid
    from datetime import datetime, timedelta

    from app.application.messaging.link_channel import StrandsTwoFactor
    from app.domain.messaging.entities import ChannelLinkCode

    link, identities, _ = _linked(two_factor=True)
    code = ChannelLinkCode(
        company_id=_uuid.uuid4(),
        code="ABC123",
        channel=Channel.TELEGRAM,
        created_by=_uuid.uuid4(),
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    await link._codes.save(code)
    with pytest.raises(StrandsTwoFactor):
        await link.redeem("ABC123", Channel.TELEGRAM, "489615644")
    assert identities.identities[0].company_id == COMPANY_ID
