"""The outbox: queue a notification, then drain it.

Enqueueing happens in the same transaction as the domain change that caused it,
so "a booking exists" and "the host will be told" commit together. Delivery is a
separate step that retries, which is what keeps a provider outage from silently
swallowing the news.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime

from app.domain.messaging.entities import OutboundNotification
from app.domain.messaging.repositories import (
    ChannelIdentityRepository,
    OutboundNotificationRepository,
)
from app.domain.messaging.services import MessageProvider
from app.domain.messaging.value_objects import Channel, NotificationEvent

logger = logging.getLogger(__name__)


def render(event: NotificationEvent, payload: dict) -> str:
    """Turn an event into the message a host reads.

    Kept as one function so every channel says the same thing and the wording
    can be reviewed in a single place.
    """
    if event == NotificationEvent.BOOKING_CREATED:
        lines = [
            "🆕 <b>Новая бронь</b>",
            f"Объект: {payload.get('property_name', '—')}",
            f"Гость: {payload.get('guest_name', '—')}",
            f"Заезд: {payload.get('check_in', '—')}",
            f"Выезд: {payload.get('check_out', '—')}",
        ]
        if payload.get("total_price"):
            lines.append(f"Сумма: {payload['total_price']}")
        if payload.get("source"):
            lines.append(f"Источник: {payload['source']}")
        return "\n".join(lines)

    if event == NotificationEvent.BOOKING_CANCELLED:
        return "\n".join(
            [
                "❌ <b>Бронь отменена</b>",
                f"Объект: {payload.get('property_name', '—')}",
                f"Гость: {payload.get('guest_name', '—')}",
                f"Даты: {payload.get('check_in', '—')} — {payload.get('check_out', '—')}",
            ]
        )

    if event == NotificationEvent.GUEST_INQUIRY:
        return "\n".join(
            [
                "💬 <b>Гость пишет в WhatsApp</b>",
                f"От: {payload.get('guest_name') or payload.get('phone', '—')}",
                f"Сообщение: {payload.get('text', '')[:400]}",
            ]
        )

    if event == NotificationEvent.GUEST_HANDOFF:
        return "\n".join(
            [
                "🙋 <b>Гостю нужен человек</b>",
                f"От: {payload.get('guest_name') or payload.get('phone', '—')}",
                f"Последнее сообщение: {payload.get('text', '')[:400]}",
                "Бот больше не отвечает в этом диалоге.",
            ]
        )

    return f"Событие: {event.value}"


class NotificationService:
    def __init__(
        self,
        notification_repo: OutboundNotificationRepository,
        identity_repo: ChannelIdentityRepository,
    ) -> None:
        self._notifications = notification_repo
        self._identities = identity_repo

    async def notify_company(
        self,
        company_id: uuid.UUID,
        event: NotificationEvent,
        payload: dict,
        channel: Channel = Channel.TELEGRAM,
    ) -> list[OutboundNotification]:
        """Queue one notification per linked chat of the company.

        A company with no linked chat queues nothing — that is not an error, it
        just means nobody has connected the bot yet.
        """
        identities = await self._identities.list_by_company(company_id, channel=channel)
        queued = []
        for identity in identities:
            queued.append(
                await self._notifications.save(
                    OutboundNotification(
                        company_id=company_id,
                        channel=channel,
                        target=identity.external_id,
                        event=event,
                        payload=payload,
                    )
                )
            )
        return queued


class NotificationDispatcher:
    """Drains the outbox. Runs on a timer inside the API process."""

    def __init__(
        self,
        notification_repo: OutboundNotificationRepository,
        providers: dict[Channel, MessageProvider],
    ) -> None:
        self._notifications = notification_repo
        self._providers = providers

    async def dispatch_due(self, *, now: datetime | None = None, limit: int = 20) -> int:
        now = now or datetime.utcnow()
        due = await self._notifications.claim_due(now=now, limit=limit)
        sent = 0

        for notification in due:
            provider = self._providers.get(notification.channel)
            if provider is None:
                notification.schedule_retry(f"No provider for {notification.channel.value}", now)
                await self._notifications.update(notification)
                continue

            try:
                await provider.send_text(notification.target, render(notification.event, notification.payload))
            except Exception as exc:  # provider failures must not kill the loop
                logger.warning("Notification %s failed: %s", notification.id, exc)
                notification.schedule_retry(str(exc), now)
                await self._notifications.update(notification)
                continue

            notification.mark_sent(now)
            await self._notifications.update(notification)
            sent += 1

        return sent
