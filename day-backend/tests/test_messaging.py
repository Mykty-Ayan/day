"""Unit tests for the messaging context: link codes, outbox, and both bots."""

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.application.messaging.date_parsing import parse_dates, parse_range
from app.application.messaging.guest_bot import GuestBotService
from app.application.messaging.host_bot import HostBotService
from app.application.messaging.link_channel import LinkChannelService
from app.application.messaging.notifications import (
    NotificationDispatcher,
    NotificationService,
    render,
)
from app.domain.assistant.value_objects import AssistantReply, AssistantUnavailable, PendingAction
from app.domain.messaging.entities import (
    ChannelIdentity,
    ChannelLinkCode,
    Conversation,
    OutboundNotification,
)
from app.domain.messaging.repositories import (
    ChannelIdentityRepository,
    ChannelLinkCodeRepository,
    OutboundNotificationRepository,
)
from app.domain.messaging.value_objects import (
    Channel,
    ConversationState,
    NotificationEvent,
    NotificationStatus,
)
from app.infrastructure.messaging.providers import FakeProvider

COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
OWNER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
OTHER_COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000099")
TODAY = date(2026, 8, 10)


# ---------- fakes ----------


class FakeLinkCodeRepository(ChannelLinkCodeRepository):
    def __init__(self, codes: list[ChannelLinkCode] | None = None) -> None:
        self.codes = {c.code: c for c in (codes or [])}

    async def get_by_code(self, code):
        return self.codes.get(code)

    async def save(self, link_code):
        self.codes[link_code.code] = link_code
        return link_code

    async def update(self, link_code):
        self.codes[link_code.code] = link_code
        return link_code


class FakeIdentityRepository(ChannelIdentityRepository):
    def __init__(self, identities: list[ChannelIdentity] | None = None) -> None:
        self.identities = list(identities or [])

    async def get_by_external_id(self, channel, external_id):
        return next(
            (i for i in self.identities if i.channel == channel and i.external_id == external_id),
            None,
        )

    async def list_by_company(self, company_id, *, channel=None, only_active=True):
        return [
            i
            for i in self.identities
            if i.company_id == company_id
            and (channel is None or i.channel == channel)
            and (not only_active or i.is_active)
        ]

    async def save(self, identity):
        self.identities.append(identity)
        return identity

    async def update(self, identity):
        self.identities = [identity if i.id == identity.id else i for i in self.identities]
        return identity


class FakeNotificationRepository(OutboundNotificationRepository):
    def __init__(self) -> None:
        self.items: list[OutboundNotification] = []

    async def save(self, notification):
        self.items.append(notification)
        return notification

    async def update(self, notification):
        self.items = [notification if n.id == notification.id else n for n in self.items]
        return notification

    async def claim_due(self, *, now, limit=20):
        return [
            n
            for n in self.items
            if n.status == NotificationStatus.PENDING
            and (n.next_attempt_at is None or n.next_attempt_at <= now)
        ][:limit]


class StubProperty:
    def __init__(self, name: str, property_id: uuid.UUID | None = None) -> None:
        self.id = property_id or uuid.uuid4()
        self.name = name


class StubAvailability:
    """Stands in for CheckAvailabilityService."""

    def __init__(self, options: list) -> None:
        self.options = options
        self.calls: list[tuple] = []

    async def execute(self, company_id, check_in, check_out, **kwargs):
        self.calls.append((company_id, check_in, check_out))
        return self.options


class StubOption:
    def __init__(self, name: str, price: Decimal | None) -> None:
        self.property = StubProperty(name)
        self.total_price = price
        self.price_error = None


class StubBooking:
    def __init__(self, booking_id: uuid.UUID | None = None) -> None:
        self.id = booking_id or uuid.uuid4()


class StubCreateBooking:
    def __init__(self, error: str | None = None) -> None:
        self.error = error
        self.inputs = []

    async def execute(self, inp):
        self.inputs.append(inp)
        if self.error:
            raise ValueError(self.error)
        return StubBooking()


# ---------- date parsing ----------


class TestDateParsing:
    def test_numeric_range(self):
        result = parse_range("12.08 - 15.08", TODAY)
        assert result.check_in == date(2026, 8, 12)
        assert result.check_out == date(2026, 8, 15)

    def test_words(self):
        result = parse_range("с 3 сентября по 7 сентября", TODAY)
        assert result.check_in == date(2026, 9, 3)
        assert result.check_out == date(2026, 9, 7)

    def test_single_date_becomes_one_night(self):
        result = parse_range("20.08", TODAY)
        assert result.check_in == date(2026, 8, 20)
        assert result.check_out == date(2026, 8, 21)

    def test_past_month_rolls_into_next_year(self):
        # January asked for in August means next January.
        assert parse_dates("15.01", TODAY) == [date(2027, 1, 15)]

    def test_relative_words(self):
        assert parse_dates("завтра", TODAY) == [date(2026, 8, 11)]
        assert parse_dates("послезавтра", TODAY) == [date(2026, 8, 12)]

    def test_reversed_range_is_refused(self):
        assert parse_range("15.08 - 12.08", TODAY) is None

    def test_text_without_dates(self):
        assert parse_range("здравствуйте, а сколько стоит?", TODAY) is None

    def test_invalid_date_is_ignored(self):
        assert parse_dates("32.13", TODAY) == []


# ---------- link codes ----------


class TestLinkChannelService:
    @pytest.mark.asyncio
    async def test_redeem_binds_chat_to_company(self):
        codes = FakeLinkCodeRepository()
        identities = FakeIdentityRepository()
        svc = LinkChannelService(codes, identities)
        code = await svc.issue_code(COMPANY_ID, OWNER_ID)

        result = await svc.redeem(code.code, Channel.TELEGRAM, "555", "Host")

        assert result.company_id == COMPANY_ID
        assert result.identity.external_id == "555"
        assert result.identity.user_id == OWNER_ID

    @pytest.mark.asyncio
    async def test_code_is_single_use(self):
        codes = FakeLinkCodeRepository()
        svc = LinkChannelService(codes, FakeIdentityRepository())
        code = await svc.issue_code(COMPANY_ID, OWNER_ID)
        await svc.redeem(code.code, Channel.TELEGRAM, "555")

        with pytest.raises(ValueError, match="expired or was already used"):
            await svc.redeem(code.code, Channel.TELEGRAM, "666")

    @pytest.mark.asyncio
    async def test_expired_code_is_refused(self):
        expired = ChannelLinkCode(
            company_id=COMPANY_ID,
            code="OLDCODE1",
            channel=Channel.TELEGRAM,
            expires_at=datetime(2026, 1, 1),
        )
        svc = LinkChannelService(FakeLinkCodeRepository([expired]), FakeIdentityRepository())

        with pytest.raises(ValueError):
            await svc.redeem("OLDCODE1", Channel.TELEGRAM, "555", now=datetime(2026, 8, 10))

    @pytest.mark.asyncio
    async def test_unknown_code_is_refused(self):
        svc = LinkChannelService(FakeLinkCodeRepository(), FakeIdentityRepository())
        with pytest.raises(ValueError, match="Unknown code"):
            await svc.redeem("NOPE", Channel.TELEGRAM, "555")

    @pytest.mark.asyncio
    async def test_relinking_moves_the_chat_instead_of_duplicating_it(self):
        identity = ChannelIdentity(
            company_id=OTHER_COMPANY_ID, channel=Channel.TELEGRAM, external_id="555"
        )
        identities = FakeIdentityRepository([identity])
        codes = FakeLinkCodeRepository()
        svc = LinkChannelService(codes, identities)
        code = await svc.issue_code(COMPANY_ID, OWNER_ID)

        await svc.redeem(code.code, Channel.TELEGRAM, "555")

        assert len(identities.identities) == 1
        assert identities.identities[0].company_id == COMPANY_ID


# ---------- outbox ----------


class TestNotifications:
    @pytest.mark.asyncio
    async def test_queues_one_notification_per_linked_chat(self):
        identities = FakeIdentityRepository(
            [
                ChannelIdentity(company_id=COMPANY_ID, channel=Channel.TELEGRAM, external_id="1"),
                ChannelIdentity(company_id=COMPANY_ID, channel=Channel.TELEGRAM, external_id="2"),
                ChannelIdentity(company_id=OTHER_COMPANY_ID, channel=Channel.TELEGRAM, external_id="3"),
            ]
        )
        repo = FakeNotificationRepository()
        svc = NotificationService(repo, identities)

        queued = await svc.notify_company(COMPANY_ID, NotificationEvent.BOOKING_CREATED, {})

        assert {n.target for n in queued} == {"1", "2"}

    @pytest.mark.asyncio
    async def test_company_without_a_linked_chat_queues_nothing(self):
        svc = NotificationService(FakeNotificationRepository(), FakeIdentityRepository())
        assert await svc.notify_company(COMPANY_ID, NotificationEvent.BOOKING_CREATED, {}) == []

    @pytest.mark.asyncio
    async def test_dispatch_sends_and_marks_sent(self):
        repo = FakeNotificationRepository()
        await repo.save(
            OutboundNotification(
                company_id=COMPANY_ID,
                channel=Channel.TELEGRAM,
                target="555",
                event=NotificationEvent.BOOKING_CREATED,
                payload={"property_name": "Studio", "guest_name": "Ann"},
            )
        )
        provider = FakeProvider()
        dispatcher = NotificationDispatcher(repo, {Channel.TELEGRAM: provider})

        sent = await dispatcher.dispatch_due()

        assert sent == 1
        assert provider.sent[0][0] == "555"
        assert "Studio" in provider.sent[0][1]
        assert repo.items[0].status == NotificationStatus.SENT

    @pytest.mark.asyncio
    async def test_failure_is_retried_with_backoff(self):
        repo = FakeNotificationRepository()
        await repo.save(
            OutboundNotification(company_id=COMPANY_ID, channel=Channel.TELEGRAM, target="555")
        )
        dispatcher = NotificationDispatcher(
            repo, {Channel.TELEGRAM: FakeProvider(fail_with="boom")}
        )
        now = datetime(2026, 8, 10, 12, 0)

        assert await dispatcher.dispatch_due(now=now) == 0

        queued = repo.items[0]
        assert queued.status == NotificationStatus.PENDING
        assert queued.attempts == 1
        assert queued.next_attempt_at == now + timedelta(minutes=1)
        assert queued.last_error == "boom"

    @pytest.mark.asyncio
    async def test_gives_up_after_max_attempts(self):
        notification = OutboundNotification(
            company_id=COMPANY_ID,
            channel=Channel.TELEGRAM,
            target="555",
            attempts=OutboundNotification.MAX_ATTEMPTS - 1,
        )
        notification.schedule_retry("still failing")

        assert notification.status == NotificationStatus.FAILED
        assert notification.next_attempt_at is None

    @pytest.mark.asyncio
    async def test_notification_not_yet_due_is_left_alone(self):
        repo = FakeNotificationRepository()
        await repo.save(
            OutboundNotification(
                company_id=COMPANY_ID,
                channel=Channel.TELEGRAM,
                target="555",
                next_attempt_at=datetime(2026, 8, 10, 13, 0),
            )
        )
        provider = FakeProvider()
        dispatcher = NotificationDispatcher(repo, {Channel.TELEGRAM: provider})

        assert await dispatcher.dispatch_due(now=datetime(2026, 8, 10, 12, 0)) == 0
        assert provider.sent == []

    def test_render_covers_every_event(self):
        for event in NotificationEvent:
            assert render(event, {}) != ""


# ---------- host bot ----------


def _host_bot(availability=None, bookings=None, assistant=None) -> HostBotService:
    return HostBotService(
        LinkChannelService(FakeLinkCodeRepository(), FakeIdentityRepository()),
        availability or StubAvailability([]),
        bookings,
        None,
        None,
        assistant_for=(lambda company_id: assistant) if assistant is not None else None,
    )


class StubAssistant:
    """Stands in for the model: returns whatever it was handed."""

    def __init__(self, reply=None, raises: Exception | None = None) -> None:
        self._reply = reply
        self._raises = raises
        self.asked: list[str] = []

    async def execute(self, question, today=None):
        self.asked.append(question)
        if self._raises is not None:
            raise self._raises
        return self._reply


class TestHostBotAssistant:
    """Free text is not a command; the bot hands it to the assistant."""

    IDENTITY = None  # set in setup_method

    def setup_method(self):
        self.IDENTITY = ChannelIdentity(
            company_id=COMPANY_ID, channel=Channel.TELEGRAM, external_id="555", user_id=OWNER_ID
        )

    @pytest.mark.asyncio
    async def test_a_sentence_is_answered_by_the_assistant(self):
        assistant = StubAssistant(AssistantReply(text="Свободна 62-я, 25 000 ₸."))
        bot = _host_bot(assistant=assistant)

        reply = await bot.handle(self.IDENTITY, "555", "что свободно завтра?")

        assert reply.text == "Свободна 62-я, 25 000 ₸."
        assert assistant.asked == ["что свободно завтра?"]

    @pytest.mark.asyncio
    async def test_a_proposed_change_is_described_not_performed(self):
        assistant = StubAssistant(
            AssistantReply(
                text="",
                pending=PendingAction(
                    tool="create_booking",
                    arguments={"guest_name": "Ерлан"},
                    summary="Забронировать 28auc на Ерлана",
                ),
            )
        )
        bot = _host_bot(assistant=assistant)

        reply = await bot.handle(self.IDENTITY, "555", "забронируй 28auc на Ерлана")

        assert "Забронировать 28auc на Ерлана" in reply.text
        # There is no button in a chat, so the bot must send them where one is.
        assert "Панел" in reply.text

    @pytest.mark.asyncio
    async def test_without_a_model_the_bot_behaves_as_before(self):
        reply = await _host_bot().handle(self.IDENTITY, "555", "что свободно завтра?")

        assert "Не понял команду" in reply.text

    @pytest.mark.asyncio
    async def test_an_unavailable_model_falls_back_to_the_help_text(self):
        bot = _host_bot(assistant=StubAssistant(raises=AssistantUnavailable("off")))

        reply = await bot.handle(self.IDENTITY, "555", "что свободно завтра?")

        assert "Не понял команду" in reply.text

    @pytest.mark.asyncio
    async def test_a_broken_model_does_not_leak_its_error(self):
        bot = _host_bot(assistant=StubAssistant(raises=RuntimeError("boom")))

        reply = await bot.handle(self.IDENTITY, "555", "что свободно завтра?")

        assert "boom" not in reply.text
        assert "Панел" in reply.text

    @pytest.mark.asyncio
    async def test_commands_still_win_over_the_assistant(self):
        assistant = StubAssistant(AssistantReply(text="я бы ответил"))
        bot = _host_bot(assistant=assistant)

        reply = await bot.handle(self.IDENTITY, "555", "/help")

        assert "Команды" in reply.text
        assert assistant.asked == []

    @pytest.mark.asyncio
    async def test_a_very_long_answer_is_trimmed_for_telegram(self):
        assistant = StubAssistant(AssistantReply(text="я" * 5000))
        bot = _host_bot(assistant=assistant)

        reply = await bot.handle(self.IDENTITY, "555", "расскажи всё")

        assert len(reply.text) < 4096


class TestHostBot:
    @pytest.mark.asyncio
    async def test_unlinked_chat_is_told_how_to_link(self):
        reply = await _host_bot().handle(None, "555", "/free")
        assert "не привязан" in reply.text

    @pytest.mark.asyncio
    async def test_start_with_a_valid_code_links_the_chat(self):
        codes = FakeLinkCodeRepository()
        identities = FakeIdentityRepository()
        link = LinkChannelService(codes, identities)
        code = await link.issue_code(COMPANY_ID, OWNER_ID)
        bot = HostBotService(link, StubAvailability([]), None, None, None)

        reply = await bot.handle(None, "555", f"/start {code.code}", "Host")

        assert "подключён" in reply.text
        assert identities.identities[0].company_id == COMPANY_ID

    @pytest.mark.asyncio
    async def test_start_with_a_bad_code_explains_itself(self):
        reply = await _host_bot().handle(None, "555", "/start WRONG123")
        assert "Unknown code" in reply.text or "код" in reply.text.lower()

    @pytest.mark.asyncio
    async def test_free_lists_available_properties_with_prices(self):
        availability = StubAvailability(
            [StubOption("Studio", Decimal("25000")), StubOption("Loft", None)]
        )
        identity = ChannelIdentity(company_id=COMPANY_ID, channel=Channel.TELEGRAM, external_id="555")

        reply = await _host_bot(availability).handle(identity, "555", "/free 12.08 15.08", today=TODAY)

        assert "Studio" in reply.text and "25000" in reply.text
        assert "Loft" in reply.text
        _, check_in, check_out = availability.calls[0]
        assert (check_in, check_out) == (date(2026, 8, 12), date(2026, 8, 15))

    @pytest.mark.asyncio
    async def test_free_without_dates_uses_tonight(self):
        availability = StubAvailability([])
        identity = ChannelIdentity(company_id=COMPANY_ID, channel=Channel.TELEGRAM, external_id="555")

        await _host_bot(availability).handle(identity, "555", "/free", today=TODAY)

        _, check_in, check_out = availability.calls[0]
        assert (check_in, check_out) == (TODAY, TODAY + timedelta(days=1))

    @pytest.mark.asyncio
    async def test_unknown_command_shows_help(self):
        identity = ChannelIdentity(company_id=COMPANY_ID, channel=Channel.TELEGRAM, external_id="555")
        reply = await _host_bot().handle(identity, "555", "/wat")
        assert "/free" in reply.text

    @pytest.mark.asyncio
    async def test_deactivated_identity_is_treated_as_unlinked(self):
        identity = ChannelIdentity(
            company_id=COMPANY_ID, channel=Channel.TELEGRAM, external_id="555", is_active=False
        )
        reply = await _host_bot().handle(identity, "555", "/free")
        assert "не привязан" in reply.text


# ---------- guest bot ----------


def _conversation(state=ConversationState.IDLE, context=None) -> Conversation:
    return Conversation(
        company_id=COMPANY_ID,
        channel=Channel.WHATSAPP,
        identity_id=uuid.uuid4(),
        state=state,
        context=context or {},
    )


class TestGuestBot:
    @pytest.mark.asyncio
    async def test_message_without_dates_gets_the_greeting(self):
        bot = GuestBotService(StubAvailability([]), StubCreateBooking())
        conversation = _conversation()

        reply = await bot.handle(conversation, "здравствуйте", "77001", today=TODAY)

        assert "даты" in reply.text.lower()
        assert conversation.state == ConversationState.AWAITING_DATES

    @pytest.mark.asyncio
    async def test_dates_produce_numbered_options(self):
        availability = StubAvailability(
            [StubOption("Studio", Decimal("20000")), StubOption("Loft", Decimal("30000"))]
        )
        bot = GuestBotService(availability, StubCreateBooking())
        conversation = _conversation()

        reply = await bot.handle(conversation, "12.08 - 15.08", "77001", today=TODAY)

        assert "1. Studio" in reply.text and "2. Loft" in reply.text
        assert conversation.state == ConversationState.AWAITING_PROPERTY_CHOICE
        assert len(conversation.context["options"]) == 2

    @pytest.mark.asyncio
    async def test_nothing_free_asks_for_other_dates(self):
        bot = GuestBotService(StubAvailability([]), StubCreateBooking())
        conversation = _conversation()

        reply = await bot.handle(conversation, "12.08 - 15.08", "77001", today=TODAY)

        assert "занято" in reply.text
        assert conversation.state == ConversationState.AWAITING_DATES

    @pytest.mark.asyncio
    async def test_explicitly_past_dates_are_refused(self):
        bot = GuestBotService(StubAvailability([]), StubCreateBooking())
        conversation = _conversation()

        reply = await bot.handle(
            conversation, "01.08.2025 - 03.08.2025", "77001", today=date(2026, 8, 20)
        )

        assert "прошли" in reply.text

    @pytest.mark.asyncio
    async def test_bare_day_month_already_passed_rolls_to_next_year_and_is_echoed(self):
        # "01.08" written on 20 August cannot mean this year. The year we picked
        # is stated back to the guest before anything is created, so a wrong
        # guess is visible rather than silent.
        bot = GuestBotService(StubAvailability([]), StubCreateBooking())
        conversation = _conversation()

        reply = await bot.handle(conversation, "01.08 - 03.08", "77001", today=date(2026, 8, 20))

        assert "01.08.2027" in reply.text

    @pytest.mark.asyncio
    async def test_full_flow_creates_a_booking(self):
        availability = StubAvailability([StubOption("Studio", Decimal("20000"))])
        creator = StubCreateBooking()
        bot = GuestBotService(availability, creator)
        conversation = _conversation()

        await bot.handle(conversation, "12.08 - 15.08", "77001", today=TODAY)
        await bot.handle(conversation, "1", "77001", today=TODAY)
        assert conversation.state == ConversationState.AWAITING_GUEST_NAME

        reply = await bot.handle(conversation, "Аня", "77001", today=TODAY)

        assert reply.booking_id is not None
        assert conversation.state == ConversationState.IDLE
        created = creator.inputs[0]
        assert created.guest_name == "Аня"
        assert created.guest_phone == "77001"
        assert created.check_in == date(2026, 8, 12)
        assert created.check_out == date(2026, 8, 15)

    @pytest.mark.asyncio
    async def test_out_of_range_choice_is_rejected(self):
        availability = StubAvailability([StubOption("Studio", Decimal("20000"))])
        bot = GuestBotService(availability, StubCreateBooking())
        conversation = _conversation()
        await bot.handle(conversation, "12.08 - 15.08", "77001", today=TODAY)

        reply = await bot.handle(conversation, "7", "77001", today=TODAY)

        assert "нет" in reply.text.lower()
        assert conversation.state == ConversationState.AWAITING_PROPERTY_CHOICE

    @pytest.mark.asyncio
    async def test_new_dates_while_choosing_restart_the_search(self):
        availability = StubAvailability([StubOption("Studio", Decimal("20000"))])
        bot = GuestBotService(availability, StubCreateBooking())
        conversation = _conversation()
        await bot.handle(conversation, "12.08 - 15.08", "77001", today=TODAY)

        await bot.handle(conversation, "а на 20.08 - 22.08?", "77001", today=TODAY)

        _, check_in, check_out = availability.calls[-1]
        assert (check_in, check_out) == (date(2026, 8, 20), date(2026, 8, 22))

    @pytest.mark.asyncio
    async def test_asking_for_a_human_hands_off_and_stops_replying(self):
        bot = GuestBotService(StubAvailability([]), StubCreateBooking())
        conversation = _conversation()

        reply = await bot.handle(conversation, "позовите менеджера", "77001", today=TODAY)
        assert reply.handoff is True
        assert conversation.state == ConversationState.HANDED_TO_HUMAN

        follow_up = await bot.handle(conversation, "12.08 - 15.08", "77001", today=TODAY)
        assert follow_up.text == ""

    @pytest.mark.asyncio
    async def test_unit_taken_between_offer_and_confirmation_hands_off(self):
        availability = StubAvailability([StubOption("Studio", Decimal("20000"))])
        creator = StubCreateBooking(error="Dates overlap an existing booking")
        bot = GuestBotService(availability, creator)
        conversation = _conversation()
        await bot.handle(conversation, "12.08 - 15.08", "77001", today=TODAY)
        await bot.handle(conversation, "1", "77001", today=TODAY)

        reply = await bot.handle(conversation, "Аня", "77001", today=TODAY)

        assert reply.handoff is True
        assert reply.booking_id is None
        assert conversation.state == ConversationState.HANDED_TO_HUMAN
