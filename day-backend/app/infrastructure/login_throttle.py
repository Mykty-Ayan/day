"""Per-account brake on password guessing.

The per-address rate limit slows one attacker down; this protects an account
that is attacked from many addresses. After MAX_FAILURES wrong passwords
within WINDOW_SECONDS the account refuses logins until the window runs out.
The right password is refused too while locked — otherwise the lock itself
would tell the attacker which guess was correct.

Like the rate limiter, it fails open: with Redis down nobody is locked out.
"""

from __future__ import annotations

import hashlib
import logging

from app.config import settings

logger = logging.getLogger(__name__)

MAX_FAILURES = 10
WINDOW_SECONDS = 15 * 60


def _key(email: str) -> str:
    digest = hashlib.sha256(email.strip().lower().encode()).hexdigest()[:32]
    return f"login_fail:{digest}"


class LoginThrottle:
    def __init__(self, redis) -> None:
        self._redis = redis

    def retry_after(self, email: str) -> int:
        """Seconds until this account may try again; 0 when it is not locked."""
        if self._redis is None:
            return 0
        try:
            key = _key(email)
            if int(self._redis.get(key) or 0) < MAX_FAILURES:
                return 0
            return max(int(self._redis.ttl(key)), 1)
        except Exception:
            logger.warning("Login throttle Redis error, allowing the attempt")
            return 0

    def failed(self, email: str) -> None:
        if self._redis is None:
            return
        try:
            key = _key(email)
            # The window starts at the first failure and is not extended by
            # later ones, so a locked account always unlocks on schedule.
            if self._redis.incr(key) == 1:
                self._redis.expire(key, WINDOW_SECONDS)
        except Exception:
            logger.warning("Login throttle Redis error, failure not counted")

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
