"""Per-account brake on password guessing.

The per-address rate limit slows one attacker down; this protects an account
that is attacked from many addresses. Every login attempt reserves a slot
before the password is checked, so parallel guesses cannot all slip past the
check; a correct password clears the slots. Once MAX_FAILURES attempts have
gone by without one, the account refuses logins for LOCK_SECONDS — the right
password included, otherwise the lock itself would tell the attacker which
guess was correct.

Like the rate limiter, it fails open: with Redis down nobody is locked out.
"""

from __future__ import annotations

import hashlib
import logging

from app.config import settings

logger = logging.getLogger(__name__)

MAX_FAILURES = 10
LOCK_SECONDS = 15 * 60


def _key(email: str) -> str:
    # The same string the account is looked up by: case variants are
    # different accounts there, so they must not share (or reset) a counter.
    digest = hashlib.sha256(email.encode()).hexdigest()[:32]
    return f"login_fail:{digest}"


class LoginThrottle:
    def __init__(self, redis) -> None:
        self._redis = redis

    def attempt(self, email: str) -> int:
        """Reserve one attempt. Returns seconds to wait when the account is locked, else 0."""
        if self._redis is None:
            return 0
        key = _key(email)
        try:
            pipe = self._redis.pipeline()  # MULTI/EXEC: the count never exists without its expiry
            pipe.incr(key)
            pipe.expire(key, LOCK_SECONDS, nx=True)
            count = pipe.execute()[0]
            if count == MAX_FAILURES:
                # The lock runs its full length from the attempt that set it,
                # not from the first failure of the window.
                self._redis.expire(key, LOCK_SECONDS)
            if count <= MAX_FAILURES:
                return 0
            return max(int(self._redis.ttl(key)), 1)
        except Exception:
            logger.warning("Login throttle Redis error, allowing the attempt")
            return 0

    def succeeded(self, email: str) -> None:
        if self._redis is None:
            return
        try:
            self._redis.delete(_key(email))
        except Exception:
            logger.warning("Login throttle Redis error, counter not cleared")


_throttle: LoginThrottle | None = None


def get_login_throttle() -> LoginThrottle:
    """FastAPI dependency; one Redis connection pool for the process."""
    global _throttle
    if _throttle is None:
        try:
            import redis

            client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1)
        except Exception:
            logger.warning("Redis unavailable for the login throttle, logins are not braked")
            client = None
        _throttle = LoginThrottle(client)
    return _throttle
