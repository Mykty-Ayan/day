"""Reset a forgotten password with a code sent to the user's own Telegram chat.

Without a linked private chat there is nothing to send to — the owner sets a
new password for staff on the team page.

Nothing a caller sees — status, text, timing — may tell whether an account
exists or has a chat: every check that does not depend on the account runs
first, and the code is stored and sent in the background.
"""

from __future__ import annotations

from collections.abc import Callable, Coroutine

from app.application.auth.auth_service import issue_tokens
from app.application.auth.telegram_codes import (
    CHECK_CODE_SCRIPT,  # noqa: F401  (re-exported for tests)
    MAX_ATTEMPTS,  # noqa: F401
    CodesUnavailable,
    TelegramCodes,
    private_chat_of,
    spawn,
)
from app.application.auth.user_service import MIN_PASSWORD_LENGTH
from app.domain.auth.repositories import UserRepository
from app.domain.messaging.repositories import ChannelIdentityRepository
from app.infrastructure.security import hash_password

ResetUnavailable = CodesUnavailable

_WRONG = "The code is wrong or expired"


def _message(code: str) -> str:
    return (
        f"Код для сброса пароля Day: {code}\n"
        "Действует 10 минут. Если вы не просили сброс — ничего не делайте, пароль останется прежним."
    )


class PasswordResetService:
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
        self._codes = TelegramCodes("pwreset", redis, telegram, spawn)

    async def request(self, email: str) -> None:
        self._codes.ensure_store()
        user = await self._users.get_by_email(email)
        if user is None or not user.is_active:
            return
        chat = await private_chat_of(self._identities, user)
        if chat is None:
            return
        self._codes.issue(user, chat, _message)

    async def confirm(self, email: str, code: str, new_password: str) -> dict:
        if len(new_password) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        self._codes.ensure_store()
        user = await self._users.get_by_email(email)
        if user is None or not user.is_active:
            raise ValueError(_WRONG)
        chat = await private_chat_of(self._identities, user) or ""
        if not await self._codes.check(user, chat, code):
            raise ValueError(_WRONG)

        # Locked and re-read: an owner may have disabled the account or
        # changed the role meanwhile, and a stale copy would write that back.
        user = await self._users.get_for_update(user.id)
        if user is None or not user.is_active:
            raise ValueError(_WRONG)
        user.hashed_password = hash_password(new_password)
        await self._users.update(user)
        user = await self._users.bump_token_version(user.id)  # whoever knew the old password is signed out
        return issue_tokens(user)
