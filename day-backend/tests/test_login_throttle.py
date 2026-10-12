"""Password guessing is braked per account and per address."""

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request

from app.infrastructure.database import get_session
from app.infrastructure.login_throttle import MAX_FAILURES, LoginThrottle, get_login_throttle
from app.infrastructure.rate_limiter import _AUTH_LIMIT, _bucket_owner, _limit_for
from app.main import app
from app.presentation.api.v1 import auth as auth_api


class FakeRedis:
    """The handful of Redis calls the throttle makes, in memory."""

    def __init__(self):
        self.values: dict[str, int] = {}
        self.ttls: dict[str, int] = {}

    def get(self, key):
        return self.values.get(key)

    def incr(self, key):
        self.values[key] = self.values.get(key, 0) + 1
        return self.values[key]

    def expire(self, key, seconds):
        self.ttls[key] = seconds

    def ttl(self, key):
        return self.ttls.get(key, -2)

    def delete(self, key):
        self.values.pop(key, None)
        self.ttls.pop(key, None)


class BrokenRedis:
    def __getattr__(self, name):
        def fail(*args, **kwargs):
            raise ConnectionError("redis down")

        return fail


def test_account_locks_after_max_failures():
    throttle = LoginThrottle(FakeRedis())
    for _ in range(MAX_FAILURES - 1):
        throttle.failed("owner@example.com")
    assert throttle.retry_after("owner@example.com") == 0

    throttle.failed("owner@example.com")
    assert throttle.retry_after("owner@example.com") > 0


def test_email_case_and_spaces_share_one_counter():
    throttle = LoginThrottle(FakeRedis())
    for _ in range(MAX_FAILURES):
        throttle.failed(" Owner@Example.com ")
    assert throttle.retry_after("owner@example.com") > 0


def test_success_clears_the_counter():
    throttle = LoginThrottle(FakeRedis())
    for _ in range(MAX_FAILURES - 1):
        throttle.failed("owner@example.com")
    throttle.succeeded("owner@example.com")
    throttle.failed("owner@example.com")
    assert throttle.retry_after("owner@example.com") == 0


def test_the_email_never_reaches_redis_in_clear():
    redis = FakeRedis()
    LoginThrottle(redis).failed("owner@example.com")
    assert all("owner@example.com" not in key for key in redis.values)


@pytest.mark.parametrize("redis", [None, BrokenRedis()])
def test_without_redis_logins_are_not_blocked(redis):
    throttle = LoginThrottle(redis)
    for _ in range(MAX_FAILURES + 1):
        throttle.failed("owner@example.com")
    assert throttle.retry_after("owner@example.com") == 0


class _FailingAuth:
    async def login(self, email, password):
        raise ValueError("Invalid email or password")


class _OkAuth:
    async def login(self, email, password):
        return {"access_token": "a", "refresh_token": "r", "token_type": "bearer"}


async def _post_login(monkeypatch, throttle, service, email="owner@example.com"):
    monkeypatch.setattr(auth_api, "_auth_service", lambda session: service)
    app.dependency_overrides[get_session] = lambda: None
    app.dependency_overrides[get_login_throttle] = lambda: throttle
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/api/v1/auth/login", json={"email": email, "password": "guess"})
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_login_throttle, None)


@pytest.mark.asyncio
async def test_locked_account_answers_429_even_with_the_right_password(monkeypatch):
    throttle = LoginThrottle(FakeRedis())
    for _ in range(MAX_FAILURES):
        assert (await _post_login(monkeypatch, throttle, _FailingAuth())).status_code == 401

    response = await _post_login(monkeypatch, throttle, _OkAuth())
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 0


@pytest.mark.asyncio
async def test_successful_login_resets_failures(monkeypatch):
    throttle = LoginThrottle(FakeRedis())
    for _ in range(MAX_FAILURES - 1):
        await _post_login(monkeypatch, throttle, _FailingAuth())
    assert (await _post_login(monkeypatch, throttle, _OkAuth())).status_code == 200
    assert throttle.retry_after("owner@example.com") == 0


def _request(path: str, method: str = "POST", headers: dict[str, str] | None = None) -> Request:
    return Request(
        {
            "type": "http",
            "method": method,
            "path": path,
            "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
            "client": ("203.0.113.7", 1234),
        }
    )


def test_auth_routes_count_by_address_whatever_header_is_sent():
    # A random Authorization header used to buy a fresh bucket per attempt.
    a = _bucket_owner(_request("/api/v1/auth/login", headers={"Authorization": "Bearer x"}))
    b = _bucket_owner(_request("/api/v1/auth/login", headers={"Authorization": "Bearer y"}))
    assert a == b == "ip:203.0.113.7"


def test_auth_routes_get_the_tight_limit():
    assert _limit_for(_request("/api/v1/auth/login")) == ("auth", _AUTH_LIMIT)
    assert _limit_for(_request("/api/v1/bookings")) == ("mutate", 30)
    assert _limit_for(_request("/api/v1/bookings", method="GET")) == ("get", 100)
