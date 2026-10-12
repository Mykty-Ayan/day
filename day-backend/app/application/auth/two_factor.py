"""Optional two-factor sign-in: after the password, a code from the user's own Telegram chat.

The Mini App needs no second step: Telegram itself vouches for the person
there. A user turns it on in Settings, with their password and a linked
private chat; turning it off also takes the password, so a stolen session
alone cannot remove it.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Coroutine

from app.application.auth.auth_service import issue_tokens, token_is_current
from app.application.auth.telegram_codes import TelegramCodes, private_chat_of, spawn
from app.domain.auth.entities import User
from app.domain.auth.repositories import UserRepository
from app.domain.messaging.repositories import ChannelIdentityRepository
from app.infrastructure.security import create_challenge_token, decode_token, verify_password

_WRONG = "The code is wrong or expired"
_NO_CHAT = "Two-factor sign-in needs your Telegram chat linked: Settings → Team"


def _message(code: str) -> str:
    return (
        f"Код для входа в Day: {code}\n"
        "Действует 10 минут. Если это не вы — смените пароль: кто-то знает его."
    )


class TwoFactorService:
    def __init__(
        self,
        users: UserRepository,
        identities: ChannelIdentityRepository,
        redis,
        telegram,
        spawn: Callable[[Coroutine], None] = spawn,
    ) -> None:
        self._users = users
        self._identities = identities
        self._codes = TelegramCodes("login2fa", redis, telegram, spawn)

    async def start(self, user: User) -> str:
        """Send a code to the user's chat; returns the challenge the code is checked against."""
        chat = await private_chat_of(self._identities, user)
        if chat is None:
            raise ValueError(_NO_CHAT)
        self._codes.ensure_store()
        self._codes.issue(user, chat, _message)
        return create_challenge_token(user.id, user.token_version)

    async def verify(self, challenge: str, code: str) -> dict:
        payload = decode_token(challenge)
        if not payload or payload.get("type") != "2fa":
            raise ValueError(_WRONG)
        self._codes.ensure_store()
        user = await self._users.get_by_id(uuid.UUID(payload["sub"]))
        if user is None or not user.is_active or not token_is_current(payload, user):
            raise ValueError(_WRONG)
        chat = await private_chat_of(self._identities, user) or ""
        if not await self._codes.check(user, chat, code):
            raise ValueError(_WRONG)
        return issue_tokens(user)

    async def set_enabled(self, user_id: uuid.UUID, password: str, enabled: bool) -> User:
        user = await self._users.get_for_update(user_id)
        if user is None or not user.is_active:
            raise ValueError("User not found")
        if not verify_password(password, user.hashed_password):
            raise ValueError("Password is wrong")
        if enabled and await private_chat_of(self._identities, user) is None:
            raise ValueError(_NO_CHAT)
        user.two_factor_enabled = enabled
        return await self._users.update(user)
