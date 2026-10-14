"""Binding an external chat to a company.

A Telegram chat arrives as a bare chat id with no way to tell whose company it
belongs to. The owner generates a short-lived code in the web app and sends it
to the bot; redeeming it creates the identity. Asking for a password inside a
chat window would be the alternative, and a worse one.
"""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.domain.auth.repositories import UserRepository
from app.domain.messaging.entities import ChannelIdentity, ChannelLinkCode
from app.domain.messaging.repositories import (
    ChannelIdentityRepository,
    ChannelLinkCodeRepository,
)
from app.domain.messaging.value_objects import Channel

CODE_TTL_MINUTES = 30
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no look-alike characters
_CODE_LENGTH = 8


def _generate_code() -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))


@dataclass
class LinkResult:
    identity: ChannelIdentity
    company_id: uuid.UUID
    # The company the chat was taken from, when re-linking moved it.
    previous_company_id: uuid.UUID | None = None


class StrandsTwoFactor(ValueError):
    """Detaching this chat would lock its user out: their sign-in codes come only here."""

    def __init__(self) -> None:
        super().__init__(
            "This chat receives your sign-in codes. Turn off the Telegram code in Settings first, then disconnect it."
        )


class LinkChannelService:
    def __init__(
        self,
        link_code_repo: ChannelLinkCodeRepository,
        identity_repo: ChannelIdentityRepository,
        user_repo: UserRepository | None = None,
    ) -> None:
        self._codes = link_code_repo
        self._identities = identity_repo
        self._users = user_repo

    async def guard_two_factor(self, identity: ChannelIdentity) -> None:
        """Refuse to detach the last private chat of a user who signs in with its codes."""
        if self._users is None or identity.user_id is None or not identity.is_active:
            return
        user = await self._users.get_by_id(identity.user_id)
        if user is None or not user.two_factor_enabled:
            return
        chats = await self._identities.list_by_company(identity.company_id, channel=identity.channel)
        others = [c for c in chats if c.id != identity.id and c.user_id == user.id and c.external_id.isdigit()]
        if not others:
            raise StrandsTwoFactor()

    async def issue_code(
        self,
        company_id: uuid.UUID,
        created_by: uuid.UUID,
        channel: Channel = Channel.TELEGRAM,
        now: datetime | None = None,
    ) -> ChannelLinkCode:
        now = now or datetime.utcnow()
        code = ChannelLinkCode(
            company_id=company_id,
            code=_generate_code(),
            channel=channel,
            created_by=created_by,
            expires_at=now + timedelta(minutes=CODE_TTL_MINUTES),
        )
        return await self._codes.save(code)

    async def issue_code_for_member(
        self,
        company_id: uuid.UUID,
        member_id: uuid.UUID,
        channel: Channel = Channel.TELEGRAM,
        now: datetime | None = None,
    ) -> ChannelLinkCode:
        """A code that links a chat as a team member, not as the owner issuing it.

        A cleaner has no reason to open the web app; the owner hands them this
        code instead. The chat then acts with the member's own rights.
        """
        member = await self._users.get_by_id(member_id) if self._users is not None else None
        if member is None or member.company_id != company_id or not member.is_active:
            raise LookupError("User not found")
        return await self.issue_code(company_id, member.id, channel, now)

    async def redeem(
        self,
        code_value: str,
        channel: Channel,
        external_id: str,
        display_name: str = "",
        now: datetime | None = None,
    ) -> LinkResult:
        now = now or datetime.utcnow()
        code = await self._codes.get_by_code(code_value.strip().upper())
        if code is None or code.channel != channel:
            raise ValueError("Unknown code")
        if not code.is_usable(now):
            raise ValueError("This code has expired or was already used")

        existing = await self._identities.get_by_external_id(channel, external_id)
        moved_from = (
            existing.company_id
            if existing is not None and existing.is_active and existing.company_id != code.company_id
            else None
        )
        if existing is not None and existing.user_id != code.created_by:
            await self.guard_two_factor(existing)
        if existing is not None:
            # Re-linking an already known chat moves it to the new company
            # rather than creating a second identity for the same external id.
            existing.company_id = code.company_id
            existing.user_id = code.created_by
            existing.display_name = display_name or existing.display_name
            existing.is_active = True
            identity = await self._identities.update(existing)
        else:
            identity = await self._identities.save(
                ChannelIdentity(
                    company_id=code.company_id,
                    channel=channel,
                    external_id=external_id,
                    display_name=display_name,
                    user_id=code.created_by,
                )
            )

        code.used_at = now
        await self._codes.update(code)
        return LinkResult(identity=identity, company_id=code.company_id, previous_company_id=moved_from)

    async def unlink(self, channel: Channel, external_id: str) -> None:
        identity = await self._identities.get_by_external_id(channel, external_id)
        if identity is None:
            return
        await self.guard_two_factor(identity)
        identity.is_active = False
        await self._identities.update(identity)
