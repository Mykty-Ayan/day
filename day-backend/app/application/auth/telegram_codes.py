"""One-time codes sent to a user's own Telegram chat: password reset, sign-in.

Day sends no e-mail; the private Telegram chat a user linked from the app is
the one channel that is provably theirs. A code is bound to the user, the
purpose, the session version and the chat it went to: a password change, a
sign-out or unlinking that chat voids every code already sent.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import secrets
import uuid
from collections.abc import Callable, Coroutine

from app.domain.auth.entities import User
from app.domain.messaging.repositories import ChannelIdentityRepository
from app.domain.messaging.value_objects import Channel

logger = logging.getLogger(__name__)

CODE_TTL_SECONDS = 10 * 60
RESEND_AFTER_SECONDS = 60
MAX_ATTEMPTS = 5

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


def spawn(coroutine: Coroutine) -> None:
    task = asyncio.create_task(coroutine)
    _background.add(task)  # held until done, or the loop may drop it mid-send
    task.add_done_callback(_background.discard)


class CodesUnavailable(Exception):
    """The code store is down: no code can be issued or checked."""


def _is_private_chat(external_id: str) -> bool:
    # Telegram group and channel ids are negative; a private chat's id is the
    # person's own. A code sent to a group is readable by every member.
    return external_id.isdigit()


async def private_chat_of(identities: ChannelIdentityRepository, user: User) -> str | None:
    chats = await identities.list_by_company(user.company_id, channel=Channel.TELEGRAM)
    return next(
        (chat.external_id for chat in chats if chat.user_id == user.id and _is_private_chat(chat.external_id)),
        None,
    )


class TelegramCodes:
    def __init__(self, purpose: str, redis, telegram, spawn: Callable[[Coroutine], None] = spawn) -> None:
        self._purpose = purpose
        self._redis = redis
        self._telegram = telegram
        self._spawn = spawn

    def _code_key(self, user_id: uuid.UUID) -> str:
        return f"{self._purpose}:{user_id}"

    def _cooldown_key(self, user_id: uuid.UUID) -> str:
        # Separate from the code: burning a code by guessing must not let the
        # next one go out at once.
        return f"{self._purpose}:cooldown:{user_id}"

    def _digest(self, user_id: uuid.UUID, code: str, version: int, chat: str) -> str:
        return hashlib.sha256(f"{self._purpose}:{user_id}:{version}:{chat}:{code}".encode()).hexdigest()

    def ensure_store(self) -> None:
        """Check before anything about the account: a down store must look the same for every caller."""
        try:
            if self._redis is None or not self._redis.ping():
                raise CodesUnavailable()
        except CodesUnavailable:
            raise
        except Exception as error:
            raise CodesUnavailable() from error

    def issue(self, user: User, chat: str, message: Callable[[str], str]) -> None:
        """Store a code and send it, after the answer: timing must not tell a real account."""
        self._spawn(self._send(user.id, user.token_version, chat, message))

    def _store(self, user_id: uuid.UUID, version: int, chat: str) -> str | None:
        if not self._redis.set(self._cooldown_key(user_id), "1", nx=True, ex=RESEND_AFTER_SECONDS):
            return None  # a code went out less than a minute ago
        code = f"{secrets.randbelow(10**6):06d}"
        key = self._code_key(user_id)
        pipe = self._redis.pipeline()  # the code never exists without its expiry
        pipe.delete(key)
        pipe.hset(key, mapping={"digest": self._digest(user_id, code, version, chat), "attempts": 0})
        pipe.expire(key, CODE_TTL_SECONDS)
        pipe.execute()
        return code

    async def _send(self, user_id: uuid.UUID, version: int, chat: str, message: Callable[[str], str]) -> None:
        try:
            # In a thread: the Redis client blocks, and on the event loop it
            # would hold up the answer for a real account only.
            code = await asyncio.to_thread(self._store, user_id, version, chat)
            if code is None:
                return
            await self._telegram.send_text(chat, message(code))
        except Exception:
            logger.exception("A %s code was not issued", self._purpose)

    async def check(self, user: User, chat: str, code: str) -> bool:
        """True once for the right code; the digest is rebuilt from today's version and chat."""
        try:
            verdict = await asyncio.to_thread(
                self._redis.eval,
                CHECK_CODE_SCRIPT,
                1,
                self._code_key(user.id),
                self._digest(user.id, code.strip(), user.token_version, chat),
                MAX_ATTEMPTS,
            )
        except Exception as error:
            raise CodesUnavailable() from error
        return int(verdict) == 1
