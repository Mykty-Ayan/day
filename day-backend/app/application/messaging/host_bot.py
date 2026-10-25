"""The host's Telegram bot.

Links the chat (/start, /stop), carries the notices, and passes whatever the
operator writes or says to the assistant. Lists, cards and every change live in
the Mini App; a change the assistant proposes is made there, never by a reply.
"""

from __future__ import annotations

import html
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import date

from app.application.messaging.link_channel import LinkChannelService, StrandsTwoFactor
from app.application.messaging.notifications import reads_bookings
from app.domain.assistant.value_objects import AssistantUnavailable, PendingAction
from app.domain.auth.repositories import CompanyRepository, UserRepository
from app.domain.messaging.entities import ChannelIdentity
from app.domain.messaging.services import AppButton
from app.domain.messaging.value_objects import Channel

_HELP = """Напишите или скажите голосом, что нужно: «кто заезжает сегодня?», «что свободно на выходные?».

Брони, квартиры, продажа и деньги — в кнопке «Day» внизу чата.
/help — эта справка
Чтобы отключить чат от компании: /stop"""

_NOT_LINKED = """Этот чат не привязан к компании.

Откройте в приложении «Настройки → Команда и API-ключи», нажмите
«Подключить Telegram» и отправьте сюда полученный код."""

# A cleaner's chat: their tasks live in the Mini App, and bookings are not theirs to read.
_STAFF = """Ваши уборки — в кнопке «Day» внизу чата: там список на сегодня и вперёд.

Брони, свободные квартиры и ассистент доступны владельцу и менеджерам.
Чтобы отключить чат: /stop"""

# Telegram refuses anything past 4096 characters; an assistant answer that long
# is a bug in the prompt, not something to split across messages.
_MAX_REPLY = 3500


def _shorten(text: str) -> str:
    text = (text or "").strip()
    return text if len(text) <= _MAX_REPLY else text[:_MAX_REPLY].rstrip() + "…"


logger = logging.getLogger(__name__)


def _uuid_or_none(value: object) -> str | None:
    """The model wrote the arguments: only a real id goes into a link."""
    try:
        return str(uuid.UUID(str(value)))
    except ValueError:
        return None


@dataclass
class BotReply:
    text: str
    # Opens the Mini App under the message; empty where Telegram would refuse one.
    buttons: list[AppButton] = field(default_factory=list)


class HostBotService:
    def __init__(
        self,
        link_service: LinkChannelService,
        # Given a company, returns something that can answer a free-text
        # question — or None when no model is configured, which leaves the bot
        # exactly as it was.
        assistant_for: Callable[[ChannelIdentity], Awaitable[object | None]] | None = None,
        # Names the company in the /start answer; without it the answer stays generic.
        company_repo: CompanyRepository | None = None,
        # Tells a cleaner's chat from an operator's; without it every linked chat is an operator's.
        user_repo: UserRepository | None = None,
        # The Mini App's https address; a proposed change gets a button opening it.
        mini_app_url: str | None = None,
    ) -> None:
        self._link = link_service
        self._assistant_for = assistant_for
        self._companies = company_repo
        self._users = user_repo
        self._mini_app_url = mini_app_url

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
        # /help, and the commands the bot no longer has (/free, /today, /bookings):
        # a slash says "command", not a question for the assistant.
        if text.strip().startswith("/"):
            return BotReply(_HELP)

        # The operator wrote a sentence, and the assistant can answer the same
        # questions the Mini App answers.
        return await self._ask_assistant(identity, text.strip(), today, history, external_id)

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
        external_id: str = "",
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
            return BotReply("Не смог ответить. Попробуйте иначе или откройте «Day» внизу чата.")

        if reply.pending is not None:
            # Approving by typing "да" would turn a chat into a state machine
            # nobody can audit: the change is made in the Mini App, by a tap.
            return self._pending_reply(reply.pending, external_id)

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

    def _pending_reply(self, pending: PendingAction, external_id: str) -> BotReply:
        """The proposed change and a button to where it is made: the booking's
        card when it is about one booking, the assistant's screen otherwise."""
        booking_id = _uuid_or_none(pending.arguments.get("booking_id"))
        # Telegram refuses a Mini App that is not https, and a Mini App button in a group.
        if not (self._mini_app_url or "").startswith("https://") or not external_id.isdigit():
            return BotReply(f"{pending.summary}\n\nСделать это можно в приложении — кнопка «Day» внизу чата.")
        if booking_id:
            return BotReply(
                f"{pending.summary}\n\nПроверьте и сделайте это в карточке брони.",
                [AppButton("Открыть бронь", f"{self._mini_app_url}?booking={booking_id}")],
            )
        return BotReply(
            f"{pending.summary}\n\nОткройте «Спросить» в приложении и повторите просьбу — "
            "там будет кнопка подтверждения.",
            [AppButton("Открыть «Спросить»", f"{self._mini_app_url}?tab=ask")],
        )
