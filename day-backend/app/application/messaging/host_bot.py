"""The host's Telegram bot.

Answers questions about the operator's own portfolio: what is free, who arrives
today, what is booked next. Every command is stateless — the chat is a control
surface, not a conversation.
"""

from __future__ import annotations

import html
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, timedelta

from app.application.booking.check_availability import CheckAvailabilityService
from app.application.messaging.date_parsing import format_date, parse_range
from app.application.messaging.link_channel import LinkChannelService, StrandsTwoFactor
from app.application.messaging.notifications import reads_bookings
from app.domain.assistant.value_objects import AssistantUnavailable
from app.domain.auth.repositories import CompanyRepository, UserRepository
from app.domain.booking.repositories import BookingRepository, GuestRepository
from app.domain.booking.value_objects import BookingStatus
from app.domain.messaging.entities import ChannelIdentity
from app.domain.messaging.value_objects import Channel
from app.domain.property.repositories import PropertyRepository

_HELP = """<b>Команды</b>
/free — свободные объекты (можно с датами: <code>/free 12.08 15.08</code>)
/today — заезды и выезды сегодня
/bookings — ближайшие брони
/help — эта справка

Чтобы отключить чат от компании: /stop"""

_NOT_LINKED = """Этот чат не привязан к компании.

Откройте в приложении «Настройки → Команда и API-ключи», нажмите
«Подключить Telegram» и отправьте сюда полученный код."""

# A cleaner's chat: their tasks live in the Mini App, and bookings are not theirs to read.
_STAFF = """Ваши уборки — в кнопке «Day» внизу чата: там список на сегодня и вперёд.

Брони, свободные квартиры и ассистент доступны владельцу и менеджерам.
Чтобы отключить чат: /stop"""

_MAX_LISTED = 15
# Telegram refuses anything past 4096 characters; an assistant answer that long
# is a bug in the prompt, not something to split across messages.
_MAX_REPLY = 3500


def _shorten(text: str) -> str:
    text = (text or "").strip()
    return text if len(text) <= _MAX_REPLY else text[:_MAX_REPLY].rstrip() + "…"


logger = logging.getLogger(__name__)


@dataclass
class BotReply:
    text: str


class HostBotService:
    def __init__(
        self,
        link_service: LinkChannelService,
        availability: CheckAvailabilityService,
        booking_repo: BookingRepository,
        property_repo: PropertyRepository,
        guest_repo: GuestRepository,
        # Given a company, returns something that can answer a free-text
        # question — or None when no model is configured, which leaves the bot
        # exactly as it was.
        assistant_for: Callable[[ChannelIdentity], Awaitable[object | None]] | None = None,
        # Names the company in the /start answer; without it the answer stays generic.
        company_repo: CompanyRepository | None = None,
        # Tells a cleaner's chat from an operator's; without it every linked chat is an operator's.
        user_repo: UserRepository | None = None,
    ) -> None:
        self._link = link_service
        self._availability = availability
        self._bookings = booking_repo
        self._properties = property_repo
        self._guests = guest_repo
        self._assistant_for = assistant_for
        self._companies = company_repo
        self._users = user_repo

    async def handle(
        self,
        identity: ChannelIdentity | None,
        external_id: str,
        text: str,
        display_name: str = "",
        today: date | None = None,
        history: list | None = None,
    ) -> BotReply:
        today = today or date.today()
        command, _, argument = text.strip().partition(" ")
        command = command.lower().lstrip("/").split("@")[0]

        # Linking is the only thing an unlinked chat may do.
        if command == "start":
            return await self._start(external_id, argument.strip(), display_name, identity)

        if identity is None or not identity.is_active:
            return BotReply(_NOT_LINKED)

        if command == "stop":
            try:
                await self._link.unlink(Channel.TELEGRAM, external_id)
            except StrandsTwoFactor:
                return BotReply(
                    "Не отключаю: сюда приходят коды для входа в Day. "
                    "Сначала выключите «Вход с кодом из Telegram» в настройках, потом отправьте /stop."
                )
            return BotReply("Чат отключён. Чтобы подключить снова, отправьте /start и код.")
        if not await self._reads_bookings(identity):
            return BotReply(_STAFF)
        if command in {"help", "menu"}:
            return BotReply(_HELP)
        if command == "free":
            return await self._free(identity.company_id, argument, today)
        if command == "today":
            return await self._today(identity.company_id, today)
        if command == "bookings":
            return await self._upcoming(identity.company_id, today)

        # Not a command. The operator wrote a sentence, and the assistant can
        # answer the same questions the Mini App answers.
        return await self._ask_assistant(identity, text.strip(), today, history)

    async def _reads_bookings(self, identity: ChannelIdentity) -> bool:
        if self._users is None or identity.user_id is None:
            return True
        return reads_bookings(await self._users.get_by_id(identity.user_id))

    async def _help_for(self, identity: ChannelIdentity) -> str:
        return _HELP if await self._reads_bookings(identity) else _STAFF

    async def _ask_assistant(
        self,
        identity: ChannelIdentity,
        question: str,
        today: date,
        history: list | None = None,
    ) -> BotReply:
        # The identity, not just the company: what the assistant may say
        # (the Wi-Fi password) depends on who is linked to this chat.
        assistant = await self._assistant_for(identity) if self._assistant_for else None
        if assistant is None:
            return BotReply(f"Не понял команду.\n\n{_HELP}")

        try:
            reply = await assistant.execute(question, history=history or [], today=today)
        except AssistantUnavailable:
            return BotReply(f"Не понял команду.\n\n{_HELP}")
        except Exception:
            logger.exception("Assistant failed to answer a bot message")
            return BotReply("Не смог ответить. Попробуйте иначе или откройте «Панель».")

        if reply.pending is not None:
            # The bot has no button to approve with, and approving by typing
            # "да" would turn a chat into a state machine nobody can audit.
            return BotReply(
                f"{reply.pending.summary}\n\nПодтвердить можно в «Панели» — там кнопка."
            )

        return BotReply(_shorten(reply.text) or f"Не понял команду.\n\n{_HELP}")

    async def _start(
        self,
        external_id: str,
        code: str,
        display_name: str,
        identity: ChannelIdentity | None,
    ) -> BotReply:
        if not code:
            if identity is not None and identity.is_active:
                return BotReply(f"Чат уже подключён.\n\n{await self._help_for(identity)}")
            return BotReply(_NOT_LINKED)

        try:
            linked = await self._link.redeem(code, Channel.TELEGRAM, external_id, display_name)
        except StrandsTwoFactor:
            return BotReply(
                "Этот чат получает коды для входа другого аккаунта Day. "
                "Пусть его владелец сначала выключит «Вход с кодом из Telegram» в настройках."
            )
        except ValueError as exc:
            return BotReply(f"{exc}. Сгенерируйте новый код в приложении.")
        linked_text = await self._linked_text(linked.company_id, linked.previous_company_id)
        return BotReply(f"{linked_text}\n\n{await self._help_for(linked.identity)}")

    async def _linked_text(self, company_id: uuid.UUID, previous_company_id: uuid.UUID | None) -> str:
        """Say which company the chat now answers for, and which one lost it."""
        name = await self._company_name(company_id)
        if name is None:
            return "Готово, чат подключён к компании."
        text = f"Готово, чат подключён к компании «{name}»."
        previous = await self._company_name(previous_company_id) if previous_company_id else None
        if previous is not None:
            text += f" От «{previous}» он отключён."
        return text

    async def _company_name(self, company_id: uuid.UUID) -> str | None:
        if self._companies is None:
            return None
        company = await self._companies.get_by_id(company_id)
        # Replies go out as Telegram HTML.
        return html.escape(company.name) if company and company.name else None

    async def _free(self, company_id: uuid.UUID, argument: str, today: date) -> BotReply:
        date_range = parse_range(argument, today)
        check_in = date_range.check_in if date_range else today
        check_out = date_range.check_out if date_range else today + timedelta(days=1)

        available = await self._availability.execute(company_id, check_in, check_out)
        header = f"<b>Свободно {format_date(check_in)} — {format_date(check_out)}</b>"
        if not available:
            return BotReply(f"{header}\n\nСвободных объектов нет.")

        lines = [header, ""]
        for item in available[:_MAX_LISTED]:
            price = f" — {item.total_price:.0f}" if item.total_price is not None else ""
            lines.append(f"• {html.escape(item.property.name)}{price}")
        if len(available) > _MAX_LISTED:
            lines.append(f"…и ещё {len(available) - _MAX_LISTED}")
        return BotReply("\n".join(lines))

    async def _today(self, company_id: uuid.UUID, today: date) -> BotReply:
        # A date bound means midnight: up to tomorrow, or the guest arriving at 14:00 is missed.
        bookings = await self._bookings.list_by_company_date_range(company_id, today, today + timedelta(days=1))
        arrivals, departures = [], []
        for booking in bookings:
            if booking.status == BookingStatus.CANCELLED:
                continue
            if booking.check_in.date() == today:
                arrivals.append(booking)
            if booking.check_out.date() == today:
                departures.append(booking)

        lines = [f"<b>Сегодня, {format_date(today)}</b>", ""]
        lines.append("<b>Заезды</b>")
        lines.extend(await self._describe(arrivals) or ["—"])
        lines.append("")
        lines.append("<b>Выезды</b>")
        lines.extend(await self._describe(departures) or ["—"])
        return BotReply("\n".join(lines))

    async def _upcoming(self, company_id: uuid.UUID, today: date) -> BotReply:
        horizon = today + timedelta(days=14)
        bookings = await self._bookings.list_by_company_date_range(company_id, today, horizon)
        upcoming = sorted(
            (b for b in bookings if b.status != BookingStatus.CANCELLED and b.check_in.date() >= today),
            key=lambda b: b.check_in,
        )
        if not upcoming:
            return BotReply("Ближайшие две недели броней нет.")

        lines = ["<b>Ближайшие брони</b>", ""]
        for booking in upcoming[:_MAX_LISTED]:
            described = await self._describe([booking])
            lines.extend(described)
        if len(upcoming) > _MAX_LISTED:
            lines.append(f"…и ещё {len(upcoming) - _MAX_LISTED}")
        return BotReply("\n".join(lines))

    async def _describe(self, bookings: list) -> list[str]:
        lines = []
        for booking in bookings:
            prop = await self._properties.get_by_id(booking.property_id)
            guest = await self._guests.get_by_id(booking.guest_id) if booking.guest_id else None
            name = html.escape(prop.name) if prop else "—"
            guest_name = html.escape(guest.name) if guest else "—"
            lines.append(
                f"• {name} · {guest_name} · "
                f"{booking.check_in.strftime('%d.%m %H:%M')} → {booking.check_out.strftime('%d.%m %H:%M')}"
            )
        return lines
