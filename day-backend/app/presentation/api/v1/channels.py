"""Connecting the bots to a company.

Telegram: the owner issues a code here and sends it to the bot.
WhatsApp: the owner registers the whapi channel id, which is what lets an
inbound guest message find its tenant.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.domain.auth.permissions import Permission
from app.domain.messaging.entities import ChannelIdentity
from app.domain.messaging.value_objects import Channel
from app.infrastructure.database import get_session
from app.infrastructure.messaging.factory import build_link_service
from app.infrastructure.repositories.messaging import SqlChannelIdentityRepository
from app.presentation.api.deps import get_company_id, get_user_id, require

channel_router = APIRouter(prefix="/channels", tags=["channels"])

CHANNEL_BINDING_PREFIX = "channel:"


class LinkCodeResponse(BaseModel):
    code: str
    expires_at: str | None
    bot_username: str | None = None


class ChannelResponse(BaseModel):
    id: uuid.UUID
    channel: Channel
    external_id: str
    display_name: str
    is_active: bool


class WhatsAppChannelCreate(BaseModel):
    # whapi calls this the channel id; it arrives on every inbound webhook.
    channel_id: str = Field(min_length=1, max_length=100)


def _to_response(identity: ChannelIdentity) -> ChannelResponse:
    return ChannelResponse(
        id=identity.id,
        channel=identity.channel,
        external_id=identity.external_id,
        display_name=identity.display_name,
        is_active=identity.is_active,
    )


@channel_router.get(
    "",
    response_model=list[ChannelResponse],
    dependencies=[Depends(require(Permission.API_KEYS_MANAGE))],
)
async def list_channels(
    company_id: uuid.UUID = Depends(get_company_id),
    session: AsyncSession = Depends(get_session),
):
    identities = await SqlChannelIdentityRepository(session).list_by_company(company_id)
    return [_to_response(i) for i in identities]


@channel_router.post(
    "/telegram/link-code",
    response_model=LinkCodeResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require(Permission.API_KEYS_MANAGE))],
)
async def create_telegram_link_code(
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID = Depends(get_user_id),
    session: AsyncSession = Depends(get_session),
):
    if not settings.TELEGRAM_BOT_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telegram bot is not configured on the server",
        )

    code = await build_link_service(session).issue_code(company_id, user_id)
    await session.commit()
    return LinkCodeResponse(
        code=code.code,
        expires_at=code.expires_at.isoformat() if code.expires_at else None,
    )


@channel_router.post(
    "/whatsapp",
    response_model=ChannelResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require(Permission.API_KEYS_MANAGE))],
)
async def register_whatsapp_channel(
    body: WhatsAppChannelCreate,
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID = Depends(get_user_id),
    session: AsyncSession = Depends(get_session),
):
    repo = SqlChannelIdentityRepository(session)
    external_id = f"{CHANNEL_BINDING_PREFIX}{body.channel_id.strip()}"

    existing = await repo.get_by_external_id(Channel.WHATSAPP, external_id)
    if existing is not None and existing.company_id != company_id:
        # One WhatsApp number serves one company; silently stealing another
        # tenant's channel would reroute their guests.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This WhatsApp channel is already registered by another company",
        )

    if existing is not None:
        existing.is_active = True
        existing.user_id = user_id
        identity = await repo.update(existing)
    else:
        identity = await repo.save(
            ChannelIdentity(
                company_id=company_id,
                channel=Channel.WHATSAPP,
                external_id=external_id,
                display_name="WhatsApp",
                user_id=user_id,
            )
        )
    await session.commit()
    return _to_response(identity)


@channel_router.delete(
    "/{identity_id}",
    response_model=ChannelResponse,
    dependencies=[Depends(require(Permission.API_KEYS_MANAGE))],
)
async def disconnect_channel(
    identity_id: uuid.UUID,
    company_id: uuid.UUID = Depends(get_company_id),
    session: AsyncSession = Depends(get_session),
):
    repo = SqlChannelIdentityRepository(session)
    identities = await repo.list_by_company(company_id, only_active=False)
    identity = next((i for i in identities if i.id == identity_id), None)
    if identity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found")

    identity.is_active = False
    updated = await repo.update(identity)
    await session.commit()
    return _to_response(updated)
