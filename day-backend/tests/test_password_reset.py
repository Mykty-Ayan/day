"""A forgotten password is reset with a code sent to the user's own Telegram chat."""

import pytest
from starlette.requests import Request

from app.application.auth.password_reset import MAX_ATTEMPTS, PasswordResetService, ResetUnavailable
from app.domain.auth.entities import User
from app.domain.auth.value_objects import UserRole
from app.domain.messaging.entities import ChannelIdentity
from app.domain.messaging.value_objects import Channel
from app.infrastructure.rate_limiter import _limit_for
from app.infrastructure.security import decode_token, hash_password, verify_password
from tests.test_auth_permissions import COMPANY_ID, FakeUserRepository
from tests.test_login_throttle import BrokenRedis, FakeRedis
from tests.test_messaging import FakeIdentityRepository


class _Telegram:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    async def send_text(self, to, text):
        self.sent.append((to, text))


def _setup(*, linked=True, active=True, redis=None):
    user = User(
        company_id=COMPANY_ID,
        email="owner@example.com",
        role=UserRole.OWNER,
        hashed_password=hash_password("forgotten-1"),
        is_active=active,
    )
    identities = (
        [ChannelIdentity(company_id=COMPANY_ID, channel=Channel.TELEGRAM, external_id="489615644", user_id=user.id)]
        if linked
        else []
    )
    users, telegram = FakeUserRepository([user]), _Telegram()
    svc = PasswordResetService(users, FakeIdentityRepository(identities), redis or FakeRedisHash(), telegram)
    return svc, users, telegram, user


class FakeRedisHash(FakeRedis):
    """FakeRedis plus the hash calls the code store uses."""

    def __init__(self):
        super().__init__()
        self.hashes: dict[str, dict] = {}

    def pipeline(self):
        redis = self

        class _Pipeline:
            def __init__(self):
                self.calls = []

            def __getattr__(self, name):
                def record(*args, **kwargs):
                    self.calls.append((name, args, kwargs))

                return record

            def execute(self):
                return [getattr(redis, name)(*args, **kwargs) for name, args, kwargs in self.calls]

        return _Pipeline()

    def hset(self, key, mapping):
        self.hashes.setdefault(key, {}).update({k: str(v) for k, v in mapping.items()})

    def hgetall(self, key):
        return dict(self.hashes.get(key, {}))

    def hincrby(self, key, field, amount):
        value = int(self.hashes.get(key, {}).get(field, 0)) + amount
        self.hashes.setdefault(key, {})[field] = str(value)
        return value

    def delete(self, key):
        super().delete(key)
        self.hashes.pop(key, None)


def _code(telegram) -> str:
    text = telegram.sent[-1][1]
    return next(word for word in text.replace(".", " ").split() if word.isdigit() and len(word) == 6)


@pytest.mark.asyncio
async def test_the_code_goes_to_the_linked_chat_and_resets_the_password():
    svc, users, telegram, user = _setup()
    await svc.request("owner@example.com")
    assert telegram.sent[0][0] == "489615644"

    tokens = await svc.confirm("owner@example.com", _code(telegram), "remembered-2")

    stored = users.users[user.id]
    assert verify_password("remembered-2", stored.hashed_password)
    assert stored.token_version == 1  # whoever had the old password is signed out
    assert decode_token(tokens["access_token"])["tv"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("setup", [{"linked": False}, {"active": False}])
async def test_nothing_is_sent_and_nothing_is_said_without_a_linked_active_account(setup):
    svc, _, telegram, _ = _setup(**setup)
    await svc.request("owner@example.com")  # no error: the answer must not reveal the account
    await svc.request("nobody@example.com")
    assert telegram.sent == []


@pytest.mark.asyncio
async def test_a_code_works_once():
    svc, _, telegram, _ = _setup()
    await svc.request("owner@example.com")
    code = _code(telegram)
    await svc.confirm("owner@example.com", code, "remembered-2")
    with pytest.raises(ValueError, match="wrong or expired"):
        await svc.confirm("owner@example.com", code, "remembered-3")


@pytest.mark.asyncio
async def test_guessing_the_code_burns_it():
    svc, users, telegram, user = _setup()
    await svc.request("owner@example.com")
    code = _code(telegram)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(MAX_ATTEMPTS):
        with pytest.raises(ValueError):
            await svc.confirm("owner@example.com", wrong, "remembered-2")
    with pytest.raises(ValueError, match="wrong or expired"):
        await svc.confirm("owner@example.com", code, "remembered-2")
    assert verify_password("forgotten-1", users.users[user.id].hashed_password)


@pytest.mark.asyncio
async def test_a_second_request_within_a_minute_sends_nothing_new():
    svc, _, telegram, _ = _setup()
    await svc.request("owner@example.com")
    await svc.request("owner@example.com")
    assert len(telegram.sent) == 1


@pytest.mark.asyncio
async def test_a_short_new_password_keeps_the_code():
    svc, _, telegram, _ = _setup()
    await svc.request("owner@example.com")
    code = _code(telegram)
    with pytest.raises(ValueError, match="at least"):
        await svc.confirm("owner@example.com", code, "short")
    await svc.confirm("owner@example.com", code, "remembered-2")


@pytest.mark.asyncio
async def test_without_redis_the_reset_says_it_is_unavailable():
    svc, _, telegram, _ = _setup(redis=BrokenRedis())
    with pytest.raises(ResetUnavailable):
        await svc.request("owner@example.com")
    assert telegram.sent == []


@pytest.mark.parametrize("path", ["/api/v1/auth/password-reset/request", "/api/v1/auth/password-reset/confirm"])
def test_reset_routes_get_the_tight_limit(path):
    request = Request({"type": "http", "method": "POST", "path": path, "headers": []})
    assert _limit_for(request)[0] == "auth"
