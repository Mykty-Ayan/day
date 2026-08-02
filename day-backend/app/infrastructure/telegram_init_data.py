"""Verification of Telegram Mini App `initData`.

Telegram hands the page a signed blob describing who opened it. Anything inside
it is attacker-controlled until the HMAC checks out, so nothing here trusts a
field before `verify_init_data` has returned.

Spec: secret = HMAC_SHA256("WebAppData", bot_token), then the payload's own
hash must equal HMAC_SHA256(secret, data_check_string).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl


class InitDataError(ValueError):
    """The blob is missing, malformed, unsigned, or too old."""


@dataclass(frozen=True)
class TelegramUser:
    id: int
    first_name: str = ""
    last_name: str = ""
    username: str = ""

    @property
    def display_name(self) -> str:
        full = " ".join(part for part in (self.first_name, self.last_name) if part)
        return full or self.username or str(self.id)


def verify_init_data(init_data: str, bot_token: str, max_age_seconds: int = 86400) -> TelegramUser:
    """Return the user who opened the Mini App, or raise `InitDataError`."""
    if not bot_token:
        raise InitDataError("Telegram bot is not configured")
    if not init_data:
        raise InitDataError("Missing initData")

    # parse_qsl keeps the values percent-decoded, which is what the check string
    # is built from.
    fields = dict(parse_qsl(init_data, strict_parsing=False))
    received_hash = fields.pop("hash", "")
    if not received_hash:
        raise InitDataError("initData is not signed")

    data_check_string = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        raise InitDataError("initData signature does not match")

    # A valid signature is forever; the freshness window is what stops a
    # captured blob being replayed indefinitely.
    try:
        auth_date = int(fields.get("auth_date", "0"))
    except ValueError as exc:
        raise InitDataError("Malformed auth_date") from exc
    if max_age_seconds and (time.time() - auth_date) > max_age_seconds:
        raise InitDataError("initData has expired, reopen the app")

    try:
        raw_user = json.loads(fields.get("user", "{}"))
        user_id = int(raw_user["id"])
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise InitDataError("initData carries no usable user") from exc

    return TelegramUser(
        id=user_id,
        first_name=raw_user.get("first_name", ""),
        last_name=raw_user.get("last_name", ""),
        username=raw_user.get("username", ""),
    )
