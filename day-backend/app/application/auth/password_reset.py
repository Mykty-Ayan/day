"""Reset a forgotten password with a code sent to the user's own Telegram chat.

Day sends no e-mail; the Telegram chat a user linked from the app is the one
channel that is provably theirs. Without a linked chat there is nothing to
send to — the owner sets a new password for staff on the team page.

The answer to a request never says whether the account exists or has a chat.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import uuid

from app.application.auth.auth_service import issue_tokens
from app.application.auth.user_service import MIN_PASSWORD_LENGTH
from app.domain.auth.entities import User
from app.domain.auth.repositories import UserRepository
from app.domain.messaging.repositories import ChannelIdentityRepository
from app.domain.messaging.value_objects import Channel
from app.infrastructure.security import hash_password

logger = logging.getLogger(__name__)

CODE_TTL_SECONDS = 10 * 60
RESEND_AFTER_SECONDS = 60
MAX_ATTEMPTS = 5

_WRONG = "The code is wrong or expired"


class ResetUnavailable(Exception):
    """The code store is down: no code can be issued or checked."""


def _key(user_id: uuid.UUID) -> str:
    return f"pwreset:{user_id}"


def _digest(user_id: uuid.UUID, code: str) -> str:
    return hashlib.sha256(f"{user_id}:{code}".encode()).hexdigest()


class PasswordResetService:
    def __init__(self, users: UserRepository, identities: ChannelIdentityRepository, redis, telegram) -> None:
        self._users = users
        self._identities = identities
        self._redis = redis
        self._telegram = telegram

    async def request(self, email: str) -> None:
        if self._redis is None:
            raise ResetUnavailable()
        user = await self._users.get_by_email(email)
        if user is None or not user.is_active:
            return
        chat = await self._chat_of(user)
        if chat is None:
            return

        key = _key(user.id)
        code = f"{secrets.randbelow(10**6):06d}"
        try:
            if self._redis.ttl(key) > CODE_TTL_SECONDS - RESEND_AFTER_SECONDS:
                return  # a code went out less than a minute ago
            pipe = self._redis.pipeline()  # the code never exists without its expiry
            pipe.delete(key)
            pipe.hset(key, mapping={"digest": _digest(user.id, code), "attempts": 0})
            pipe.expire(key, CODE_TTL_SECONDS)
            pipe.execute()
        except Exception as error:
            raise ResetUnavailable() from error

        text = (
            f"Код для сброса пароля Day: {code}\n"
            "Действует 10 минут. Если вы не просили сброс — ничего не делайте, пароль останется прежним."
        )
        try:
            await self._telegram.send_text(chat, text)
        except Exception:
            # Saying so would tell the caller the account exists and has a chat.
            logger.exception("Password reset code could not be sent to Telegram")

    async def confirm(self, email: str, code: str, new_password: str) -> dict:
        user = await self._users.get_by_email(email)
        if user is None or not user.is_active:
            raise ValueError(_WRONG)
        if len(new_password) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")

        key = _key(user.id)
        try:
            stored = self._redis.hgetall(key) if self._redis is not None else None
            if stored is None:
                raise ResetUnavailable()
            if not stored:
                raise ValueError(_WRONG)
            attempts = self._redis.hincrby(key, "attempts", 1)
            matches = hmac.compare_digest(stored.get("digest", ""), _digest(user.id, code.strip()))
            if not matches or attempts > MAX_ATTEMPTS:
                if attempts >= MAX_ATTEMPTS:
                    self._redis.delete(key)  # five wrong guesses burn the code
                raise ValueError(_WRONG)
            self._redis.delete(key)
        except (ValueError, ResetUnavailable):
            raise
        except Exception as error:
            raise ResetUnavailable() from error

        user.hashed_password = hash_password(new_password)
        user.token_version += 1  # whoever knew the old password is signed out
        user = await self._users.update(user)
        return issue_tokens(user)

    async def _chat_of(self, user: User) -> str | None:
        chats = await self._identities.list_by_company(user.company_id, channel=Channel.TELEGRAM)
        return next((chat.external_id for chat in chats if chat.user_id == user.id), None)
