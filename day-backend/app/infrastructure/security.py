from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import settings

API_KEY_PREFIX = "day_sk_"
_API_KEY_ENTROPY_BYTES = 32
# The visible head of a key, kept in the clear so the UI can tell two keys apart
# without ever storing the secret itself.
API_KEY_HINT_LENGTH = len(API_KEY_PREFIX) + 6


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def generate_api_key() -> str:
    """Return a fresh service key. Shown to the operator exactly once."""
    return f"{API_KEY_PREFIX}{secrets.token_urlsafe(_API_KEY_ENTROPY_BYTES)}"


def hash_api_key(key: str) -> str:
    """Hash a service key for storage and lookup.

    SHA-256 rather than bcrypt on purpose: the key is 256 bits of machine
    entropy, so there is nothing to brute-force, and a bot authenticates on
    every request — a deliberately slow KDF would put ~100ms on each call.
    """
    return hashlib.sha256(key.encode()).hexdigest()


def api_key_hint(key: str) -> str:
    return key[:API_KEY_HINT_LENGTH]


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(sub: uuid.UUID, company_id: uuid.UUID, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(sub),
        "company_id": str(company_id),
        "role": role,
        "type": "access",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(sub: uuid.UUID, company_id: uuid.UUID, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {
        "sub": str(sub),
        "company_id": str(company_id),
        "role": role,
        "type": "refresh",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
