"""Per-account brake on password guessing.

The per-address rate limit slows one attacker down; this protects an account
that is attacked from many addresses. Every login attempt reserves a slot
before the password is checked, so parallel guesses cannot all slip past the
check; a correct password clears the slots. Once MAX_FAILURES attempts have
gone by without one, the account refuses logins for LOCK_SECONDS — the right
password included, otherwise the lock itself would tell the attacker which
guess was correct.

Like the rate limiter, it fails open: with Redis down nobody is locked out.
A throttle built to fail closed (a flat's phone digits) refuses instead.
"""

from __future__ import annotations

import hashlib
import logging

from app.config import settings

logger = logging.getLogger(__name__)

MAX_FAILURES = 10
LOCK_SECONDS = 15 * 60
# What a throttle that fails closed asks to wait while Redis is down.
_REDIS_DOWN_WAIT = 60


def _key(email: str, prefix: str = "login_fail") -> str:
    # The same string the account is looked up by: case variants are
    # different accounts there, so they must not share (or reset) a counter.
    digest = hashlib.sha256(email.encode()).hexdigest()[:32]
    return f"{prefix}:{digest}"


class LoginThrottle:
    def __init__(
        self,
        redis,
        *,
        prefix: str = "login_fail",
        max_failures: int = MAX_FAILURES,
        lock_seconds: int = LOCK_SECONDS,
        fail_closed: bool = False,
    ) -> None:
        self._redis = redis
        self._prefix = prefix
        self._max = max_failures
        self._lock = lock_seconds
        # With Redis down a password still has its own strength; a few digits have none.
        self._closed = fail_closed

    def attempt(self, email: str) -> int:
        """Reserve one attempt. Returns seconds to wait when the account is locked, else 0."""
        if self._redis is None:
            return _REDIS_DOWN_WAIT if self._closed else 0
        key = _key(email, self._prefix)
        try:
            pipe = self._redis.pipeline()  # MULTI/EXEC: the count never exists without its expiry
            pipe.incr(key)
            pipe.expire(key, self._lock, nx=True)
            count = pipe.execute()[0]
            if count == self._max:
                # The lock runs its full length from the attempt that set it,
                # not from the first failure of the window.
                self._redis.expire(key, self._lock)
            if count <= self._max:
                return 0
            return max(int(self._redis.ttl(key)), 1)
        except Exception:
            logger.warning("Login throttle Redis error, %s the attempt", "refusing" if self._closed else "allowing")
            return _REDIS_DOWN_WAIT if self._closed else 0

    def succeeded(self, email: str) -> None:
        if self._redis is None:
            return
        try:
            self._redis.delete(_key(email, self._prefix))
        except Exception:
            logger.warning("Login throttle Redis error, counter not cleared")


_throttle: LoginThrottle | None = None
_stay_key_throttle: StayKeyThrottle | None = None

# A guest opens their booking from the flat's page (an NFC tag, a QR code) by the
# last 4 digits of their phone: 10 000 to try, so a flat takes a few guesses only.
# 5 in a row, then a wait; and at most 15 a day, so a stay of a week leaves a
# guesser about a 1% chance. The cost: a stranger can lock the flat's page for a
# day, and the guest opens the booking by its own link instead.
STAY_KEY_MAX_FAILURES = 5
STAY_KEY_DAILY_TRIES = 15
_DAY = 24 * 60 * 60


class StayKeyThrottle:
    def __init__(self, redis) -> None:
        self.short = LoginThrottle(redis, prefix="stay_key_fail", max_failures=STAY_KEY_MAX_FAILURES, fail_closed=True)
        self.daily = LoginThrottle(
            redis, prefix="stay_key_day", max_failures=STAY_KEY_DAILY_TRIES, lock_seconds=_DAY, fail_closed=True
        )

    def attempt(self, code: str) -> int:
        """Seconds to wait before trying the flat's digits again, else 0."""
        return self.short.attempt(code) or self.daily.attempt(code)

    def succeeded(self, code: str) -> None:
        # The day's count stays: the right digits must not hand a guesser a fresh day.
        self.short.succeeded(code)


def _redis_client():
    try:
        import redis

        return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1)
    except Exception:
        logger.warning("Redis unavailable for the throttle, attempts are not braked")
        return None


def get_login_throttle() -> LoginThrottle:
    """FastAPI dependency; one Redis connection pool for the process."""
    global _throttle
    if _throttle is None:
        _throttle = LoginThrottle(_redis_client())
    return _throttle


def get_stay_key_throttle() -> StayKeyThrottle:
    """The brake for a flat's "I am staying here": counted per flat, not per address."""
    global _stay_key_throttle
    if _stay_key_throttle is None:
        _stay_key_throttle = StayKeyThrottle(_redis_client())
    return _stay_key_throttle
