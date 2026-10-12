"""Password guessing is braked per account and per address."""

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request

from app.infrastructure.database import get_session
from app.infrastructure.login_throttle import LOCK_SECONDS, MAX_FAILURES, LoginThrottle, get_login_throttle
from app.infrastructure.rate_limiter import _AUTH_LIMIT, _bucket_owner, _limit_for
from app.main import app
from app.presentation.api.v1 import auth as auth_api


class FakeRedis:
    """The handful of Redis calls the throttle makes, in memory."""

    def __init__(self):
        self.values: dict[str, int] = {}
        self.ttls: dict[str, int] = {}

    def pipeline(self):
        return _FakePipeline(self)

    def incr(self, key):
        self.values[key] = self.values.get(key, 0) + 1
        return self.values[key]

    def expire(self, key, seconds, nx=False):
        if nx and key in self.ttls:
            return False
        self.ttls[key] = seconds
        return True

    def ttl(self, key):
        return self.ttls.get(key, -2)

    def delete(self, key):
        self.values.pop(key, None)
        self.ttls.pop(key, None)


class _FakePipeline:
    def __init__(self, redis):
        self._redis, self._calls = redis, []

    def incr(self, key):
        self._calls.append(lambda: self._redis.incr(key))

    def expire(self, key, seconds, nx=False):
        self._calls.append(lambda: self._redis.expire(key, seconds, nx=nx))

    def execute(self):
        return [call() for call in self._calls]


class BrokenRedis:
    def __getattr__(self, name):
        def fail(*args, **kwargs):
            raise ConnectionError("redis down")

        return fail


def _attempts(throttle, email, n):
    return [throttle.attempt(email) for _ in range(n)]


def test_account_locks_after_max_failures():
    throttle = LoginThrottle(FakeRedis())
    assert _attempts(throttle, "owner@example.com", MAX_FAILURES) == [0] * MAX_FAILURES
    assert throttle.attempt("owner@example.com") > 0


def test_the_lock_runs_full_length_from_the_attempt_that_set_it():
    redis = FakeRedis()
    throttle = LoginThrottle(redis)
    _attempts(throttle, "owner@example.com", MAX_FAILURES - 1)
    for key in redis.ttls:
        redis.ttls[key] = 1  # the window that began with the first failure is nearly over
    throttle.attempt("owner@example.com")
    assert set(redis.ttls.values()) == {LOCK_SECONDS}


def test_case_variants_are_separate_accounts_and_counters():
    # Accounts are looked up by the exact email, so another account's success
    # must not clear the victim's counter.
    throttle = LoginThrottle(FakeRedis())
    _attempts(throttle, "owner@example.com", MAX_FAILURES)
    throttle.succeeded("Owner@example.com")
    assert throttle.attempt("owner@example.com") > 0


def test_success_clears_the_counter():
    throttle = LoginThrottle(FakeRedis())
    _attempts(throttle, "owner@example.com", MAX_FAILURES - 1)
    throttle.succeeded("owner@example.com")
    assert _attempts(throttle, "owner@example.com", MAX_FAILURES) == [0] * MAX_FAILURES


def test_the_email_never_reaches_redis_in_clear():
    redis = FakeRedis()
    LoginThrottle(redis).attempt("owner@example.com")
    assert all("owner@example.com" not in key for key in redis.values)


@pytest.mark.parametrize("redis", [None, BrokenRedis()])
def test_without_redis_logins_are_not_blocked(redis):
    throttle = LoginThrottle(redis)
    assert _attempts(throttle, "owner@example.com", MAX_FAILURES + 1) == [0] * (MAX_FAILURES + 1)


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
    assert _attempts(throttle, "owner@example.com", MAX_FAILURES) == [0] * MAX_FAILURES


class _CountingAuth:
    def __init__(self):
        self.checked = 0

    async def login(self, email, password):
        self.checked += 1
        await asyncio.sleep(0)  # let the parallel requests interleave
        raise ValueError("Invalid email or password")


@pytest.mark.asyncio
async def test_parallel_guesses_cannot_all_slip_past_the_lock(monkeypatch):
    throttle = LoginThrottle(FakeRedis())
    _attempts(throttle, "owner@example.com", MAX_FAILURES - 1)
    auth = _CountingAuth()
    monkeypatch.setattr(auth_api, "_auth_service", lambda session: auth)
    app.dependency_overrides[get_session] = lambda: None
    app.dependency_overrides[get_login_throttle] = lambda: throttle
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            body = {"email": "owner@example.com", "password": "guess"}
            responses = await asyncio.gather(*[client.post("/api/v1/auth/login", json=body) for _ in range(5)])
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_login_throttle, None)
    assert auth.checked == 1
    assert sorted(r.status_code for r in responses) == [401, 429, 429, 429, 429]


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


def test_password_routes_count_by_address_whatever_header_is_sent():
    # A random Authorization header used to buy a fresh bucket per attempt.
    a = _bucket_owner(_request("/api/v1/auth/login", headers={"Authorization": "Bearer x"}))
    b = _bucket_owner(_request("/api/v1/auth/login", headers={"Authorization": "Bearer y"}))
    assert a == b == "ip:203.0.113.7"


def test_password_routes_get_the_tight_limit():
    assert _limit_for(_request("/api/v1/auth/login")) == ("auth", _AUTH_LIMIT)
    assert _limit_for(_request("/api/v1/auth/register")) == ("auth", _AUTH_LIMIT)
    assert _limit_for(_request("/api/v1/bookings")) == ("mutate", 30)
    assert _limit_for(_request("/api/v1/bookings", method="GET")) == ("get", 100)


@pytest.mark.parametrize("path", ["/api/v1/auth/refresh", "/api/v1/auth/telegram-miniapp"])
def test_session_routes_keep_the_ordinary_limit(path):
    # A 429 on refresh or the Mini App sign-in drops a live session.
    assert _limit_for(_request(path)) == ("mutate", 30)


def test_auth_me_keeps_the_callers_own_bucket():
    owner = _bucket_owner(_request("/api/v1/auth/me", method="GET", headers={"Authorization": "Bearer x"}))
    assert owner.startswith("authorization:")
