"""The outbox: queue a notification, then drain it.

Enqueueing happens in the same transaction as the domain change that caused it,
so "a booking exists" and "the host will be told" commit together. Delivery is a
separate step that retries, which is what keeps a provider outage from silently
swallowing the news.
"""

from __future__ import annotations

import html
import logging
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation

from app.domain.auth.entities import User
from app.domain.auth.permissions import Permission, permissions_for_role
from app.domain.auth.repositories import UserRepository
from app.domain.messaging.entities import ChannelIdentity, OutboundNotification
from app.domain.messaging.repositories import (
    ChannelIdentityRepository,
    OutboundNotificationRepository,
)
from app.domain.messaging.services import AppButton, MessageProvider
from app.domain.messaging.value_objects import Channel, NotificationEvent

logger = logging.getLogger(__name__)


_SOURCES = {
    "direct": "Прямое", "booking": "Booking.com", "airbnb": "Airbnb", "other": "Другое", "crm": "CRM",
    "offer": "Личная ссылка",
    "site": "Сайт",
}

_BOOKING_EVENTS = {
    NotificationEvent.BOOKING_CREATED,
    NotificationEvent.BOOKING_CANCELLED,
    NotificationEvent.GUEST_HOLD,
    NotificationEvent.GUEST_CHECKED_OUT,
}


# Addressed to one person, a cleaner included, not to everyone who reads bookings.
_PERSONAL_EVENTS = {NotificationEvent.CLEANING_ASSIGNED}

_CLEANING_TYPES = {
    "post_checkout": "после выезда",
    "mid_stay": "во время проживания",
    "on_demand": "по запросу",
}


def _money(value: str) -> str:
    try:
        amount = Decimal(value)
    except InvalidOperation:
        return value
    shown = f"{amount:,.0f}" if amount == amount.to_integral_value() else f"{amount:,.2f}"
    return f"{shown.replace(',', ' ')} ₸"


def reads_bookings(user: User | None) -> bool:
    """Every notice and every bot answer is about bookings or guests: a cleaner gets none of it."""
    return user is not None and user.is_active and Permission.BOOKINGS_READ in permissions_for_role(user.role)


# How the guest chose to pay a minibar order, and what the host does next.
_ORDER_BILLING = {
    "invoice": "Оплата по счёту: подтвердите заказ и выставьте счёт Kaspi на номер гостя",
    "booking": "Оплата с бронью: подтвердите заказ и везите",
}


def render(event: NotificationEvent, payload: dict) -> str:
    """Turn an event into the message a host reads.

    Kept as one function so every channel says the same thing and the wording
    can be reviewed in a single place. Telegram reads it as HTML, so whatever a
    guest or host typed is escaped.
    """
    payload = dict(payload)
    if isinstance(payload.get("text"), str):
        # Cut before escaping: a cut through "&amp;" makes Telegram refuse the message.
        payload["text"] = payload["text"][:400]
    payload = {key: html.escape(value) if isinstance(value, str) else value for key, value in payload.items()}
    if isinstance(payload.get("lines"), list):
        payload["lines"] = [html.escape(str(line)) for line in payload["lines"]]

    if event == NotificationEvent.BOOKING_CREATED:
        lines = [
            "🆕 <b>Новая бронь</b>",
            f"Объект: {payload.get('property_name', '—')}",
            f"Гость: {payload.get('guest_name', '—')}",
            f"Заезд: {payload.get('check_in', '—')}",
            f"Выезд: {payload.get('check_out', '—')}",
        ]
        if payload.get("total_price"):
            lines.append(f"Сумма: {_money(payload['total_price'])}")
        if payload.get("source"):
            lines.append(f"Источник: {_SOURCES.get(payload['source'], payload['source'])}")
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

    if event == NotificationEvent.GUEST_HOLD:
        lines = [
            # From the flat's page the guest came with no chat; from a link, after one.
            "🔔 <b>Бронь с сайта</b>" if payload.get("source") == "site" else "🔔 <b>Бронь по ссылке гостя</b>",
            f"Объект: {payload.get('property_name', '—')}",
            f"Гость: {payload.get('guest_name', '—')}, {payload.get('phone', '—')}",
            f"Заезд: {payload.get('check_in', '—')}",
            f"Выезд: {payload.get('check_out', '—')}",
            f"Гостей: {payload.get('guests', '—')}",
        ]
        if payload.get("total_price"):
            lines.append(f"За ночи при заселении: {_money(payload['total_price'])}")
        until = payload.get("until", "—")
        if payload.get("deposit"):
            lines += [
                "",
                f"Выставьте счёт Kaspi на залог {_money(payload['deposit'])} на номер {payload.get('phone', '—')}.",
                f"Даты держим до {until}. Оплату отметьте в карточке брони и подтвердите её,"
                " иначе бронь снимется сама.",
            ]
        else:
            lines += ["", f"Залог у квартиры не задан: подтвердите бронь в карточке до {until}, иначе она снимется."]
        return "\n".join(lines)

    if event == NotificationEvent.GUEST_CHECKED_OUT:
        lines = [
            "🚪 <b>Гость выехал</b>",
            f"Объект: {payload.get('property_name', '—')}",
            f"Гость: {payload.get('guest_name', '—')}",
        ]
        if payload.get("cleaning_created"):
            lines.append("Создана задача уборки.")
        lines.append("Проверьте квартиру и отметьте выезд в карточке брони.")
        return "\n".join(lines)
    if event == NotificationEvent.GUEST_ORDER_CANCELLED:
        return "\n".join(
            [
                f"❌ <b>Гость отменил заказ №{payload.get('number', '—')}</b>",
                f"Объект: {payload.get('property_name', '—')}",
            ]
        )
    if event == NotificationEvent.GUEST_ORDER:
        lines = [
            f"🛒 <b>Новый заказ №{payload.get('number', '—')}</b>",
            f"Объект: {payload.get('property_name', '—')}",
            *(f"• {line}" for line in payload.get("lines", [])),
            f"Сумма: {_money(payload['total'])}" if payload.get("total") else "",
        ]
        if payload.get("note"):
            lines.append(f"Комментарий: {payload['note']}")
        billing = _ORDER_BILLING.get(payload.get("billing", ""))
        if billing:
            lines.append(billing)
        return "\n".join(line for line in lines if line)

    if event == NotificationEvent.CALENDAR_CLASH:
        return "\n".join(
            [
                "⚠️ <b>Двойная бронь</b>",
                f"Объект: {payload.get('property_name', '—')}",
                f"Календарь {payload.get('feed_name', '—')} закрыл ночи {payload.get('nights', '—')},",
                "а в Day на них есть бронь. Отмените одну из двух броней.",
            ]
        )

    if event == NotificationEvent.CLEANING_ASSIGNED:
        when = " ".join(part for part in (payload.get("date"), payload.get("time")) if part) or "дата не указана"
        lines = [
            "🧹 <b>Новая уборка</b>",
            f"Объект: {payload.get('property_name', '—')}",
            f"Когда: {when}",
        ]
        if payload.get("type") in _CLEANING_TYPES:
            lines.append(f"Уборка {_CLEANING_TYPES[payload['type']]}")
        if payload.get("notes"):
            lines.append(f"Комментарий: {payload['notes']}")
        return "\n".join(lines)

    if event == NotificationEvent.GUEST_INQUIRY:
        return "\n".join(
            [
                "💬 <b>Гость пишет в WhatsApp</b>",
                f"От: {payload.get('guest_name') or payload.get('phone', '—')}",
                f"Сообщение: {payload.get('text', '')}",
            ]
        )

    if event == NotificationEvent.GUEST_HANDOFF:
        return "\n".join(
            [
                "🙋 <b>Гостю нужен человек</b>",
                f"От: {payload.get('guest_name') or payload.get('phone', '—')}",
                f"Последнее сообщение: {payload.get('text', '')}",
                "Бот больше не отвечает в этом диалоге.",
            ]
        )

    return f"Событие: {event.value}"


class NotificationService:
    def __init__(
        self,
        notification_repo: OutboundNotificationRepository,
        identity_repo: ChannelIdentityRepository,
        user_repo: UserRepository | None = None,
    ) -> None:
        self._notifications = notification_repo
        self._identities = identity_repo
        self._users = user_repo

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
        if self._users is not None:
            users = await self._users.get_many([i.user_id for i in identities if i.user_id is not None])
            identities = [i for i in identities if i.user_id is None or reads_bookings(users.get(i.user_id))]
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


    async def notify_user(
        self,
        company_id: uuid.UUID,
        user_id: uuid.UUID,
        event: NotificationEvent,
        payload: dict,
        channel: Channel = Channel.TELEGRAM,
    ) -> list[OutboundNotification]:
        """Queue a notice for one person's linked chats; none linked, nothing queued.

        The dispatcher checks again before sending that the chat is still this
        person's, so the payload carries who it is for.
        """
        identities = await self._identities.list_by_company(company_id, channel=channel)
        return [
            await self._notifications.save(
                OutboundNotification(
                    company_id=company_id,
                    channel=channel,
                    target=identity.external_id,
                    event=event,
                    payload={**payload, "user_id": str(user_id)},
                )
            )
            for identity in identities
            if identity.user_id == user_id
        ]


class NotificationDispatcher:
    """Drains the outbox. Runs on a timer inside the API process."""

    def __init__(
        self,
        notification_repo: OutboundNotificationRepository,
        providers: dict[Channel, MessageProvider],
        mini_app_url: str | None = None,
        identity_repo: ChannelIdentityRepository | None = None,
        user_repo: UserRepository | None = None,
    ) -> None:
        self._notifications = notification_repo
        self._providers = providers
        self._mini_app_url = mini_app_url
        self._identities = identity_repo
        self._users = user_repo

    async def _still_allowed(self, notification: OutboundNotification) -> bool:
        """The chat was checked when the notice was queued; by the time it goes out
        (a retry can be half an hour later) it may be a cleaner's, another
        company's, or switched off."""
        if self._identities is None:
            return True
        identity: ChannelIdentity | None = await self._identities.get_by_external_id(
            notification.channel, notification.target
        )
        if identity is None or not identity.is_active or identity.company_id != notification.company_id:
            return False
        if notification.event in _PERSONAL_EVENTS:
            if identity.user_id is None or str(identity.user_id) != notification.payload.get("user_id"):
                return False
            if self._users is None:
                return True
            user = await self._users.get_by_id(identity.user_id)
            return user is not None and user.is_active
        if identity.user_id is None or self._users is None:
            return True
        return reads_bookings(await self._users.get_by_id(identity.user_id))

    def _buttons(self, notification: OutboundNotification) -> list[AppButton] | None:
        """"Open the booking" under a booking notice, where Telegram can show it.

        Telegram refuses a Mini App that is not https and a Mini App button in a
        group, so a dev server or a group chat gets the text alone.
        """
        booking_id = notification.payload.get("booking_id")
        order_id = notification.payload.get("order_id")
        if not (self._mini_app_url or "").startswith("https://") or not notification.target.isdigit():
            return None
        if notification.event == NotificationEvent.CLEANING_ASSIGNED:
            # A cleaner's Mini App opens on their cleanings.
            return [AppButton("Мои уборки", self._mini_app_url)]
        if notification.event in (NotificationEvent.GUEST_ORDER, NotificationEvent.GUEST_ORDER_CANCELLED) and order_id:
            return [AppButton("Открыть заказ", f"{self._mini_app_url}?order={order_id}")]
        if notification.event not in _BOOKING_EVENTS or not booking_id:
            return None
        return [AppButton("Открыть бронь", f"{self._mini_app_url}?booking={booking_id}")]

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

            if not await self._still_allowed(notification):
                notification.drop("The chat may no longer read this")
                await self._notifications.update(notification)
                continue

            try:
                await provider.send_text(
                    notification.target,
                    render(notification.event, notification.payload),
                    buttons=self._buttons(notification),
                )
            except Exception as exc:  # provider failures must not kill the loop
                logger.warning("Notification %s failed: %s", notification.id, exc)
                notification.schedule_retry(str(exc), now)
                await self._notifications.update(notification)
                continue

            notification.mark_sent(now)
            await self._notifications.update(notification)
            sent += 1

        return sent
