"""Signing in from the Telegram Mini App.

There is no password here: Telegram vouches for who opened the page, and the
chat they opened it from is already bound to a company by the link-code flow.
That binding is the authorization — a Telegram account nobody linked gets
nothing.
"""

from __future__ import annotations

from app.domain.auth.repositories import UserRepository
from app.domain.messaging.repositories import ChannelIdentityRepository
from app.domain.messaging.value_objects import Channel
from app.infrastructure.security import create_access_token, create_refresh_token
from app.infrastructure.telegram_init_data import TelegramUser


class TelegramNotLinked(ValueError):
    """The Telegram account has no active link to a company."""


class TelegramLoginService:
    def __init__(
        self,
        identity_repo: ChannelIdentityRepository,
        user_repo: UserRepository,
    ) -> None:
        self._identities = identity_repo
        self._users = user_repo

    async def issue_tokens(self, telegram_user: TelegramUser) -> dict:
        # In a private chat Telegram's chat id equals the user id, which is what
        # the bot stored when the owner redeemed their link code.
        identity = await self._identities.get_by_external_id(Channel.TELEGRAM, str(telegram_user.id))
        if identity is None or not identity.is_active:
            raise TelegramNotLinked(
                "This Telegram account is not connected. Open the bot and send the code from the app."
            )
        if identity.user_id is None:
            raise TelegramNotLinked("This chat is not connected to a user account")

        user = await self._users.get_by_id(identity.user_id)
        if user is None or not user.is_active:
            raise TelegramNotLinked("The linked account is disabled")
        if user.company_id != identity.company_id:
            # The chat was re-linked to another company after the fact; refuse
            # rather than hand out a token for the wrong tenant.
            raise TelegramNotLinked("The link is stale, reconnect the chat")

        return {
            "access_token": create_access_token(user.id, user.company_id, user.role.value),
            "refresh_token": create_refresh_token(user.id, user.company_id, user.role.value),
            "token_type": "bearer",
        }
