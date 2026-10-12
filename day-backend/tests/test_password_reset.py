"""A forgotten password is reset with a code sent to the user's own Telegram chat."""

import pytest
from starlette.requests import Request

from app.application.auth.password_reset import (
    CHECK_CODE_SCRIPT,
    MAX_ATTEMPTS,
    PasswordResetService,
    ResetUnavailable,
)
from app.domain.auth.entities import User
from app.domain.auth.value_objects import UserRole
from app.domain.messaging.entities import ChannelIdentity
from app.domain.messaging.value_objects import Channel
from app.infrastructure.rate_limiter import _limit_for
from app.infrastructure.security import decode_token, hash_password, verify_password
from tests.test_auth_permissions import COMPANY_ID, FakeUserRepository
from tests.test_login_throttle import BrokenRedis, FakeRedis
from tests.test_messaging import FakeIdentityRepository


class FakeStore(FakeRedis):
    """FakeRedis plus the calls the reset makes; eval runs the check script's logic."""

    def __init__(self):
        super().__init__()
        self.hashes: dict[str, dict] = {}
        self.strings: dict[str, str] = {}

    def ping(self):
        return True

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.strings:
            return None
        self.strings[key] = value
        return True

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

    def delete(self, key):
        super().delete(key)
        self.hashes.pop(key, None)

    def eval(self, script, numkeys, key, digest, max_attempts):
        assert script == CHECK_CODE_SCRIPT
        stored = self.hashes.get(key)
        if not stored:
            return -1
        attempts = int(stored.get("attempts", 0)) + 1
        stored["attempts"] = str(attempts)
        if stored["digest"] == digest and attempts <= int(max_attempts):
            self.delete(key)
            return 1
        if attempts >= int(max_attempts):
            self.delete(key)
        return 0


class _Telegram:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    async def send_text(self, to, text):
        self.sent.append((to, text))


class _Background(list):
    async def drain(self):
        while self:
            await self.pop(0)


def _setup(*, chat="489615644", active=True, redis=None):
    user = User(
        company_id=COMPANY_ID,
        email="owner@example.com",
        role=UserRole.OWNER,
        hashed_password=hash_password("forgotten-1"),
        is_active=active,
    )
    identities = (
        [ChannelIdentity(company_id=COMPANY_ID, channel=Channel.TELEGRAM, external_id=chat, user_id=user.id)]
        if chat
        else []
    )
    users, telegram, background = FakeUserRepository([user]), _Telegram(), _Background()
    store = redis or FakeStore()
    svc = PasswordResetService(users, FakeIdentityRepository(identities), store, telegram, spawn=background.append)
    return svc, users, telegram, user, background, store


def _code(telegram) -> str:
    text = telegram.sent[-1][1]
    return next(word for word in text.replace(".", " ").split() if word.isdigit() and len(word) == 6)


async def _request(svc, background, email="owner@example.com"):
    await svc.request(email)
    await background.drain()


@pytest.mark.asyncio
async def test_the_code_goes_to_the_linked_chat_and_resets_the_password():
    svc, users, telegram, user, background, _ = _setup()
    await _request(svc, background)
    assert telegram.sent[0][0] == "489615644"

    tokens = await svc.confirm("owner@example.com", _code(telegram), "remembered-2")

    stored = users.users[user.id]
    assert verify_password("remembered-2", stored.hashed_password)
    assert stored.token_version == 1  # whoever had the old password is signed out
    assert decode_token(tokens["access_token"])["tv"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("setup", [{"chat": None}, {"active": False}, {"chat": "-1001234567890"}])
async def test_nothing_is_sent_without_an_active_account_with_a_private_chat(setup):
    # A group chat (negative id) is readable by every member: never a target.
    svc, _, telegram, _, background, _ = _setup(**setup)
    await _request(svc, background)
    await _request(svc, background, "nobody@example.com")
    assert telegram.sent == []


@pytest.mark.asyncio
async def test_the_answer_does_not_wait_for_telegram():
    svc, _, telegram, _, background, _ = _setup()
    await svc.request("owner@example.com")
    assert telegram.sent == [] and len(background) == 1  # sending happens after the answer
    await background.drain()
    assert len(telegram.sent) == 1


@pytest.mark.asyncio
async def test_a_code_works_once():
    svc, _, telegram, _, background, _ = _setup()
    await _request(svc, background)
    code = _code(telegram)
    await svc.confirm("owner@example.com", code, "remembered-2")
    with pytest.raises(ValueError, match="wrong or expired"):
        await svc.confirm("owner@example.com", code, "remembered-3")


@pytest.mark.asyncio
async def test_guessing_the_code_burns_it_and_the_cooldown_stays():
    svc, users, telegram, user, background, _ = _setup()
    await _request(svc, background)
    code = _code(telegram)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(MAX_ATTEMPTS):
        with pytest.raises(ValueError):
            await svc.confirm("owner@example.com", wrong, "remembered-2")
    with pytest.raises(ValueError, match="wrong or expired"):
        await svc.confirm("owner@example.com", code, "remembered-2")
    assert verify_password("forgotten-1", users.users[user.id].hashed_password)

    await _request(svc, background)  # within the minute: no fresh code to guess at
    assert len(telegram.sent) == 1


@pytest.mark.asyncio
async def test_a_second_request_within_a_minute_sends_nothing_new():
    svc, _, telegram, _, background, _ = _setup()
    await _request(svc, background)
    await _request(svc, background)
    assert len(telegram.sent) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("email", ["owner@example.com", "nobody@example.com"])
async def test_a_short_password_is_refused_the_same_way_for_any_email(email):
    svc, _, _, _, background, _ = _setup()
    await _request(svc, background)
    with pytest.raises(ValueError, match="at least"):
        await svc.confirm(email, "123456", "short")


@pytest.mark.asyncio
async def test_a_short_new_password_keeps_the_code():
    svc, _, telegram, _, background, _ = _setup()
    await _request(svc, background)
    code = _code(telegram)
    with pytest.raises(ValueError, match="at least"):
        await svc.confirm("owner@example.com", code, "short")
    await svc.confirm("owner@example.com", code, "remembered-2")


@pytest.mark.asyncio
@pytest.mark.parametrize("email", ["owner@example.com", "nobody@example.com"])
async def test_without_redis_every_email_gets_unavailable(email):
    svc, _, telegram, _, background, _ = _setup(redis=BrokenRedis())
    with pytest.raises(ResetUnavailable):
        await svc.request(email)
    with pytest.raises(ResetUnavailable):
        await svc.confirm(email, "123456", "long-enough-1")
    assert telegram.sent == [] and background == []


@pytest.mark.parametrize("path", ["/api/v1/auth/password-reset/request", "/api/v1/auth/password-reset/confirm"])
def test_reset_routes_get_the_tight_limit(path):
    request = Request({"type": "http", "method": "POST", "path": path, "headers": []})
    assert _limit_for(request)[0] == "auth"
