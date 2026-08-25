"""The guest-facing WhatsApp bot.

Takes a guest from "у вас свободно на выходные?" to a pending booking, and hands
over to a human the moment it is out of its depth. Everything it does goes
through the same services the web app uses, so a bot booking and a manual one
are the same object with a different source.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from app.application.booking.check_availability import AvailableProperty, CheckAvailabilityService
from app.application.booking.create_booking import CreateBookingInput, CreateBookingService
from app.application.messaging.date_parsing import format_date, parse_range
from app.domain.booking.value_objects import BookingSource
from app.domain.messaging.entities import Conversation
from app.domain.messaging.value_objects import ConversationState

_MAX_OPTIONS = 5

_GREETING = """Здравствуйте! Помогу подобрать свободные апартаменты.

Напишите даты заезда и выезда — например «12.08 - 15.08»."""

_HANDOFF = "Передаю ваш вопрос менеджеру — он ответит здесь же."

_HUMAN_WORDS = {"оператор", "менеджер", "человек", "живой", "позвонить", "жалоба"}


@dataclass
class GuestReply:
    text: str
    # Set when the exchange produced something the host must know about.
    handoff: bool = False
    booking_id: uuid.UUID | None = None


def _option_lines(options: list[AvailableProperty]) -> str:
    lines = []
    for index, item in enumerate(options, start=1):
        price = f" — {item.total_price:.0f}" if item.total_price is not None else ""
        lines.append(f"{index}. {item.property.name}{price}")
    return "\n".join(lines)


class GuestBotService:
    def __init__(
        self,
        availability: CheckAvailabilityService,
        create_booking: CreateBookingService,
    ) -> None:
        self._availability = availability
        self._create_booking = create_booking

    async def handle(
        self,
        conversation: Conversation,
        text: str,
        phone: str,
        display_name: str = "",
        today: date | None = None,
    ) -> GuestReply:
        today = today or date.today()
        message = text.strip()
        lowered = message.lower()

        if conversation.state == ConversationState.HANDED_TO_HUMAN:
            # Once a human is involved the bot stays out of the way.
            return GuestReply("", handoff=False)

        if any(word in lowered for word in _HUMAN_WORDS):
            conversation.state = ConversationState.HANDED_TO_HUMAN
            return GuestReply(_HANDOFF, handoff=True)

        if conversation.state == ConversationState.AWAITING_PROPERTY_CHOICE:
            return await self._choose_property(conversation, message, today)

        if conversation.state == ConversationState.AWAITING_GUEST_NAME:
            return await self._confirm_with_name(conversation, message, phone, display_name)

        return await self._offer_availability(conversation, message, today)

    async def _offer_availability(
        self,
        conversation: Conversation,
        message: str,
        today: date,
    ) -> GuestReply:
        date_range = parse_range(message, today)
        if date_range is None:
            conversation.state = ConversationState.AWAITING_DATES
            return GuestReply(_GREETING)

        if date_range.check_in < today:
            return GuestReply("Эти даты уже прошли. Напишите, пожалуйста, будущие даты.")

        available = await self._availability.execute(
            conversation.company_id, date_range.check_in, date_range.check_out
        )
        period = f"{format_date(date_range.check_in)} — {format_date(date_range.check_out)}"

        if not available:
            conversation.state = ConversationState.AWAITING_DATES
            return GuestReply(
                f"На {period} всё занято. Напишите другие даты — посмотрю, что есть."
            )

        options = available[:_MAX_OPTIONS]
        conversation.state = ConversationState.AWAITING_PROPERTY_CHOICE
        conversation.context = {
            "check_in": date_range.check_in.isoformat(),
            "check_out": date_range.check_out.isoformat(),
            "options": [
                {
                    "property_id": str(item.property.id),
                    "name": item.property.name,
                    "total_price": str(item.total_price) if item.total_price is not None else None,
                }
                for item in options
            ],
        }

        return GuestReply(
            f"На {period} свободно:\n\n{_option_lines(options)}\n\n"
            "Напишите номер варианта, который подходит."
        )

    async def _choose_property(
        self,
        conversation: Conversation,
        message: str,
        today: date,
    ) -> GuestReply:
        options = conversation.context.get("options", [])

        # New dates in this message mean the guest changed their mind rather
        # than answering the question.
        if parse_range(message, today) is not None:
            return await self._offer_availability(conversation, message, today)

        digits = "".join(ch for ch in message if ch.isdigit())
        if not digits:
            return GuestReply(f"Напишите номер варианта:\n\n{self._render_options(options)}")

        choice = int(digits)
        if not 1 <= choice <= len(options):
            return GuestReply(f"Такого варианта нет. Выберите номер:\n\n{self._render_options(options)}")

        conversation.context = {**conversation.context, "chosen_index": choice - 1}
        conversation.state = ConversationState.AWAITING_GUEST_NAME
        chosen = options[choice - 1]
        return GuestReply(f"Записываю «{chosen['name']}». Как вас зовут?")

    async def _confirm_with_name(
        self,
        conversation: Conversation,
        message: str,
        phone: str,
        display_name: str,
    ) -> GuestReply:
        guest_name = message.strip() or display_name or phone
        context = conversation.context
        options = context.get("options", [])
        index = context.get("chosen_index")

        if index is None or index >= len(options):
            conversation.state = ConversationState.AWAITING_DATES
            conversation.context = {}
            return GuestReply("Что-то пошло не так с выбором. Напишите даты ещё раз, пожалуйста.")

        chosen = options[index]
        check_in = date.fromisoformat(context["check_in"])
        check_out = date.fromisoformat(context["check_out"])

        try:
            booking = await self._create_booking.execute(
                CreateBookingInput(
                    company_id=conversation.company_id,
                    property_id=uuid.UUID(chosen["property_id"]),
                    guest_name=guest_name,
                    guest_phone=phone,
                    check_in=check_in,
                    check_out=check_out,
                    source=BookingSource.DIRECT,
                    notes="Заявка из WhatsApp-бота",
                )
            )
        except ValueError as exc:
            # Someone took the unit between the offer and the confirmation.
            conversation.state = ConversationState.HANDED_TO_HUMAN
            conversation.context = {}
            return GuestReply(
                f"Не получилось оформить бронь: {exc}. Передаю менеджеру, он свяжется с вами.",
                handoff=True,
            )

        conversation.state = ConversationState.IDLE
        conversation.context = {}
        return GuestReply(
            f"Готово, {guest_name}! Заявка на «{chosen['name']}» "
            f"с {format_date(check_in)} по {format_date(check_out)} принята.\n"
            "Менеджер подтвердит её и пришлёт детали заселения.",
            booking_id=booking.id,
        )

    @staticmethod
    def _render_options(options: list[dict]) -> str:
        return "\n".join(
            f"{index}. {option['name']}" for index, option in enumerate(options, start=1)
        )
