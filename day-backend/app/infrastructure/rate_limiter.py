"""Redis-based rate limiter middleware for FastAPI."""

from __future__ import annotations

import logging
import time

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.config import settings

logger = logging.getLogger(__name__)

# Rate limits per minute
_GET_LIMIT = 100
_MUTATE_LIMIT = 30

# Paths excluded from rate limiting
_EXCLUDED_PATHS = {"/api/v1/health", "/health"}


def _get_redis():
    """Lazily create a Redis connection. Returns None if unavailable."""
    try:
        import redis

        return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1)
    except Exception:
        logger.warning("Redis unavailable for rate limiting, requests will pass through")
        return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app) -> None:
        super().__init__(app)
        self._redis = None
        self._redis_checked = False

    def _ensure_redis(self):
        if not self._redis_checked:
            self._redis = _get_redis()
            self._redis_checked = True
        return self._redis

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip excluded paths
        if request.url.path in _EXCLUDED_PATHS:
            return await call_next(request)

        # Never rate-limit CORS preflight: browsers auto-send OPTIONS and a 429
        # here would short-circuit before the CORS middleware, so the browser
        # would report an opaque CORS failure instead of a rate-limit response.
        if request.method.upper() == "OPTIONS":
            return await call_next(request)

        r = self._ensure_redis()
        if r is None:
            # Graceful fallback: no rate limiting if Redis unavailable
            return await call_next(request)

        # Determine rate limit based on method
        method = request.method.upper()
        if method == "GET":
            limit = _GET_LIMIT
        else:
            limit = _MUTATE_LIMIT

        # Extract company_id from header
        company_id = request.headers.get("x-company-id", "default")
        bucket = "get" if method == "GET" else "mutate"
        window = 60  # 1 minute window

        now = int(time.time())
        window_start = now - (now % window)
        key = f"ratelimit:{company_id}:{bucket}:{window_start}"

        try:
            pipe = r.pipeline()
            pipe.incr(key)
            pipe.expire(key, window + 1)
            results = pipe.execute()
            current = results[0]

            remaining = max(0, limit - current)
            reset_at = window_start + window

            if current > limit:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Please try again later."},
                    headers={
                        "X-RateLimit-Limit": str(limit),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(reset_at),
                    },
                )

            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            response.headers["X-RateLimit-Reset"] = str(reset_at)
            return response

        except Exception:
            logger.warning("Rate limiter Redis error, allowing request through")
            return await call_next(request)
