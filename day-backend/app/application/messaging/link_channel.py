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


class LinkChannelService:
    def __init__(
        self,
        link_code_repo: ChannelLinkCodeRepository,
        identity_repo: ChannelIdentityRepository,
    ) -> None:
        self._codes = link_code_repo
        self._identities = identity_repo

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
        return LinkResult(identity=identity, company_id=code.company_id)

    async def unlink(self, channel: Channel, external_id: str) -> None:
        identity = await self._identities.get_by_external_id(channel, external_id)
        if identity is None:
            return
        identity.is_active = False
        await self._identities.update(identity)
