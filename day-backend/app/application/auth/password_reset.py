"""Reset a forgotten password with a code sent to the user's own Telegram chat.

Day sends no e-mail; the private Telegram chat a user linked from the app is
the one channel that is provably theirs. Without one there is nothing to send
to — the owner sets a new password for staff on the team page.

Nothing a caller sees — status, text, timing — may tell whether an account
exists or has a chat: every check that does not depend on the account runs
first, and the code is stored and sent in the background.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import secrets
import uuid
from collections.abc import Callable, Coroutine

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

# Read, count and burn in one step, so two checks of one code cannot both
# read it before either counts. 1 = right code (now spent), 0 = wrong, -1 = none.
CHECK_CODE_SCRIPT = """
local digest = redis.call('HGET', KEYS[1], 'digest')
if not digest then return -1 end
local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
if digest == ARGV[1] and attempts <= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1])
  return 1
end
if attempts >= tonumber(ARGV[2]) then redis.call('DEL', KEYS[1]) end
return 0
"""

_background: set[asyncio.Task] = set()


def _spawn(coroutine: Coroutine) -> None:
    task = asyncio.create_task(coroutine)
    _background.add(task)  # held until done, or the loop may drop it mid-send
    task.add_done_callback(_background.discard)


class ResetUnavailable(Exception):
    """The code store is down: no code can be issued or checked."""


def _code_key(user_id: uuid.UUID) -> str:
    return f"pwreset:{user_id}"


def _cooldown_key(user_id: uuid.UUID) -> str:
    # Separate from the code: burning a code by guessing must not let the
    # next one go out at once.
    return f"pwreset:cooldown:{user_id}"


def _digest(user_id: uuid.UUID, code: str) -> str:
    return hashlib.sha256(f"{user_id}:{code}".encode()).hexdigest()


def _is_private_chat(external_id: str) -> bool:
    # Telegram group and channel ids are negative; a private chat's id is the
    # person's own. A code sent to a group is readable by every member.
    return external_id.isdigit()


class PasswordResetService:
    def __init__(
        self,
        users: UserRepository,
        identities: ChannelIdentityRepository,
        redis,
        telegram,
        spawn: Callable[[Coroutine], None] = _spawn,
    ) -> None:
        self._users = users
        self._identities = identities
        self._redis = redis
        self._telegram = telegram
        self._spawn = spawn

    def _ensure_store(self) -> None:
        """Before anything about the account: a down store must look the same for every email."""
        try:
            if self._redis is None or not self._redis.ping():
                raise ResetUnavailable()
        except ResetUnavailable:
            raise
        except Exception as error:
            raise ResetUnavailable() from error

    async def request(self, email: str) -> None:
        self._ensure_store()
        user = await self._users.get_by_email(email)
        if user is None or not user.is_active:
            return
        chat = await self._private_chat_of(user)
        if chat is None:
            return
        self._spawn(self._send_code(user.id, chat))

    async def _send_code(self, user_id: uuid.UUID, chat: str) -> None:
        try:
            if not self._redis.set(_cooldown_key(user_id), "1", nx=True, ex=RESEND_AFTER_SECONDS):
                return  # a code went out less than a minute ago
            code = f"{secrets.randbelow(10**6):06d}"
            key = _code_key(user_id)
            pipe = self._redis.pipeline()  # the code never exists without its expiry
            pipe.delete(key)
            pipe.hset(key, mapping={"digest": _digest(user_id, code), "attempts": 0})
            pipe.expire(key, CODE_TTL_SECONDS)
            pipe.execute()
            await self._telegram.send_text(
                chat,
                f"Код для сброса пароля Day: {code}\n"
                "Действует 10 минут. Если вы не просили сброс — ничего не делайте, пароль останется прежним.",
            )
        except Exception:
            logger.exception("Password reset code was not issued")

    async def confirm(self, email: str, code: str, new_password: str) -> dict:
        if len(new_password) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        self._ensure_store()
        user = await self._users.get_by_email(email)
        if user is None or not user.is_active:
            raise ValueError(_WRONG)

        try:
            verdict = self._redis.eval(
                CHECK_CODE_SCRIPT, 1, _code_key(user.id), _digest(user.id, code.strip()), MAX_ATTEMPTS
            )
        except Exception as error:
            raise ResetUnavailable() from error
        if int(verdict) != 1:
            raise ValueError(_WRONG)

        user.hashed_password = hash_password(new_password)
        await self._users.update(user)
        user = await self._users.bump_token_version(user.id)  # whoever knew the old password is signed out
        return issue_tokens(user)

    async def _private_chat_of(self, user: User) -> str | None:
        chats = await self._identities.list_by_company(user.company_id, channel=Channel.TELEGRAM)
        return next(
            (chat.external_id for chat in chats if chat.user_id == user.id and _is_private_chat(chat.external_id)),
            None,
        )
