"""Inbound webhooks for the Telegram and WhatsApp bots.

These are the only unauthenticated endpoints in the product, so each one proves
the caller is the provider before doing anything:

* Telegram echoes a secret we set at `setWebhook` in a header.
* whapi sends no signature, so the secret is a path segment — the URL itself is
  the credential and must be treated as one.

Both always answer 200. A provider that receives an error retries the same
update for hours; a message we could not handle is logged, not replayed.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.messaging.guest_bot import GuestBotService
from app.application.messaging.host_bot import HostBotService
from app.application.messaging.notifications import NotificationService
from app.config import settings
from app.domain.messaging.entities import ChannelIdentity, Conversation, Message
from app.domain.messaging.value_objects import (
    Channel,
    MessageDirection,
    MessageStatus,
    NotificationEvent,
)
from app.infrastructure.channex.factory import build_booking_event_service
from app.infrastructure.database import get_session
from app.infrastructure.messaging.factory import (
    build_guest_bot,
    build_host_bot,
    build_notification_service,
    get_provider,
)
from app.infrastructure.repositories.messaging import (
    SqlChannelIdentityRepository,
    SqlConversationRepository,
    SqlMessageRepository,
)
from app.presentation.api.v1.channels import CHANNEL_BINDING_PREFIX

logger = logging.getLogger(__name__)

webhook_router = APIRouter(prefix="/webhooks", tags=["webhooks"])

def _ok() -> dict:
    return {"ok": True}


async def _conversation_for(
    session: AsyncSession,
    identity_id: uuid.UUID,
    company_id: uuid.UUID,
    channel: Channel,
) -> Conversation:
    conversations = SqlConversationRepository(session)
    existing = await conversations.get_by_identity(identity_id)
    if existing is not None:
        return existing
    return await conversations.save(
        Conversation(company_id=company_id, channel=channel, identity_id=identity_id)
    )


async def _record(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    direction: MessageDirection,
    body: str,
    provider_message_id: str | None,
    status_value: MessageStatus,
    payload: dict | None = None,
) -> None:
    await SqlMessageRepository(session).save(
        Message(
            conversation_id=conversation_id,
            direction=direction,
            body=body,
            provider_message_id=provider_message_id,
            status=status_value,
            payload=payload or {},
        )
    )


@webhook_router.post("/telegram", include_in_schema=False)
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
):
    if not settings.TELEGRAM_WEBHOOK_SECRET:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Bot is not configured")
    if x_telegram_bot_api_secret_token != settings.TELEGRAM_WEBHOOK_SECRET:
        # Not the provider. Say nothing useful.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    update = await request.json()
    message = update.get("message") or {}
    chat = message.get("chat") or {}
    text = (message.get("text") or "").strip()
    chat_id = str(chat.get("id") or "")

    if not chat_id or not text:
        # Photos, stickers, edits and joins are not commands.
        return _ok()

    provider_message_id = f"tg:{chat_id}:{message.get('message_id')}"
    if await SqlMessageRepository(session).exists_provider_message(provider_message_id):
        return _ok()

    display_name = " ".join(
        part for part in [chat.get("first_name"), chat.get("last_name")] if part
    ) or chat.get("username", "")

    identities = SqlChannelIdentityRepository(session)
    identity = await identities.get_by_external_id(Channel.TELEGRAM, chat_id)

    bot: HostBotService = build_host_bot(session)
    reply = await bot.handle(identity, chat_id, text, display_name)

    # The identity may have just been created by /start.
    identity = identity or await identities.get_by_external_id(Channel.TELEGRAM, chat_id)
    if identity is not None:
        conversation = await _conversation_for(session, identity.id, identity.company_id, Channel.TELEGRAM)
        await _record(
            session,
            conversation.id,
            MessageDirection.INBOUND,
            text,
            provider_message_id,
            MessageStatus.RECEIVED,
            {"chat_id": chat_id},
        )

    await session.commit()

    if reply.text:
        provider = get_provider(Channel.TELEGRAM)
        try:
            await provider.send_text(chat_id, reply.text)
        except Exception as exc:
            # The update is already consumed; a failed reply must not make
            # Telegram redeliver it.
            logger.warning("Telegram reply to %s failed: %s", chat_id, exc)

    return _ok()


@webhook_router.post("/channex/{secret}", include_in_schema=False)
async def channex_webhook(
    secret: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Inbound Channex events. Booking events are applied through the revision
    pipeline (idempotent by revision id); ARI echoes are ignored."""
    if not settings.CHANNEX_WEBHOOK_SECRET:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Channex is not configured")
    if secret != settings.CHANNEX_WEBHOOK_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    event = await request.json()
    event_name = str(event.get("event") or "")
    if not event_name.startswith("booking"):
        return _ok()

    payload = event.get("payload") or {}
    if not payload:
        return _ok()

    service = build_booking_event_service(session)
    try:
        result = await service.execute(payload)
    except Exception as exc:
        # Partial flushes (booking updates, the event row) must not survive a
        # failed revision; the un-acked revision stays in the feed and the next
        # delivery retries it from scratch. Channex must still get a 200.
        await session.rollback()
        logger.warning("Channex event failed: %s", exc)
        return _ok()

    if result.applied:
        await session.commit()
    return _ok()


@webhook_router.post("/whatsapp/{secret}", include_in_schema=False)
async def whatsapp_webhook(
    secret: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    if not settings.WHAPI_WEBHOOK_SECRET:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Bot is not configured")
    if secret != settings.WHAPI_WEBHOOK_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    payload = await request.json()
    channel_id = str(payload.get("channel_id") or "")
    identities = SqlChannelIdentityRepository(session)

    # One whapi channel belongs to one company; the owner registers its id in
    # the app, which is what lets an inbound message find its tenant.
    binding = await identities.get_by_external_id(
        Channel.WHATSAPP, f"{CHANNEL_BINDING_PREFIX}{channel_id}"
    )
    if binding is None:
        logger.warning("WhatsApp message for unregistered channel %s", channel_id)
        return _ok()

    guest_bot: GuestBotService = build_guest_bot(session)
    notifications: NotificationService = build_notification_service(session)
    conversations = SqlConversationRepository(session)
    messages = SqlMessageRepository(session)

    for raw in payload.get("messages", []):
        if raw.get("from_me") or raw.get("type") != "text":
            continue

        provider_message_id = f"wa:{raw.get('id')}"
        if await messages.exists_provider_message(provider_message_id):
            continue

        chat_id = str(raw.get("chat_id") or raw.get("from") or "")
        phone = str(raw.get("from") or "").split("@")[0]
        text = (raw.get("text") or {}).get("body", "").strip()
        if not chat_id or not text:
            continue

        identity = await identities.get_by_external_id(Channel.WHATSAPP, chat_id)
        if identity is None:
            identity = await identities.save(
                ChannelIdentity(
                    company_id=binding.company_id,
                    channel=Channel.WHATSAPP,
                    external_id=chat_id,
                    display_name=raw.get("from_name", ""),
                )
            )

        conversation = await _conversation_for(
            session, identity.id, identity.company_id, Channel.WHATSAPP
        )
        await _record(
            session,
            conversation.id,
            MessageDirection.INBOUND,
            text,
            provider_message_id,
            MessageStatus.RECEIVED,
            {"chat_id": chat_id, "phone": phone},
        )

        reply = await guest_bot.handle(
            conversation, text, phone, display_name=raw.get("from_name", "")
        )
        await conversations.update(conversation)

        if reply.handoff:
            await notifications.notify_company(
                identity.company_id,
                NotificationEvent.GUEST_HANDOFF,
                {"phone": phone, "guest_name": raw.get("from_name", ""), "text": text},
            )
        if reply.booking_id is not None:
            await notifications.notify_company(
                identity.company_id,
                NotificationEvent.BOOKING_CREATED,
                {
                    "guest_name": raw.get("from_name", "") or phone,
                    "source": "WhatsApp",
                    "booking_id": str(reply.booking_id),
                },
            )

        await session.commit()

        if reply.text:
            provider = get_provider(Channel.WHATSAPP)
            try:
                sent = await provider.send_text(chat_id, reply.text)
                await _record(
                    session,
                    conversation.id,
                    MessageDirection.OUTBOUND,
                    reply.text,
                    f"wa:{sent.provider_message_id}",
                    MessageStatus.SENT,
                )
            except Exception as exc:
                logger.warning("WhatsApp reply to %s failed: %s", chat_id, exc)
                await _record(
                    session,
                    conversation.id,
                    MessageDirection.OUTBOUND,
                    reply.text,
                    None,
                    MessageStatus.FAILED,
                )
            await session.commit()

    return _ok()
