"""One lazily created Redis client for the request path (None when Redis is not configured)."""

from __future__ import annotations

import logging

from app.config import settings

logger = logging.getLogger(__name__)

_client = None
_created = False


def get_redis():
    global _client, _created
    if not _created:
        _created = True
        try:
            import redis

            _client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1)
        except Exception:
            logger.warning("Redis client could not be created")
            _client = None
    return _client
