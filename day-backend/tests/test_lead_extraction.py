"""Reading messages from the colleagues' groups.

The model does the reading; these tests pin down what happens to what it says
afterwards. That boundary is where the damage would be: a hallucinated date or
a room count of forty reaches an operator's screen as if a colleague had
written it.

`tests/fixtures/group_messages.json` holds 281 real messages from the WhatsApp
groups, with phone numbers replaced by stable placeholders. Nothing here calls
a model — the fixture is used to check the shape of the traffic the service has
to survive.
"""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from app.application.leads.read_message import ReadGroupMessageService, _coerce
from app.domain.assistant.gateway import ModelResponse
from app.domain.leads.value_objects import DateRange, MessageKind, RoomCount

TODAY = date(2026, 8, 26)
FIXTURE = Path(__file__).parent / "fixtures" / "group_messages.json"


class StubGateway:
    """Answers with whatever the test put in, and records what it was asked."""

    def __init__(self, reply: str = "{}") -> None:
        self._reply = reply
        self.seen: list[str] = []

    async def complete(self, messages, tools):
        self.seen = [m.content for m in messages]
        return ModelResponse(text=self._reply)


class TestReadingARequest:
    @pytest.mark.asyncio
    async def test_it_keeps_every_field_the_colleague_stated(self):
        gateway = StubGateway(
            json.dumps(
                {
                    "kind": "request",
                    "district": "Коктем 3",
                    "guests": 2,
                    "rooms_min": 2,
                    "rooms_max": 2,
                    "check_in": "2026-08-26",
                    "nights": 2,
                    "budget": 25000,
                    "commission": True,
                }
            )
        )

        parsed = await ReadGroupMessageService(gateway).execute("…", today=TODAY)

        assert parsed.kind is MessageKind.REQUEST
        assert parsed.district == "Коктем 3"
        assert parsed.guests == 2
        assert parsed.rooms == RoomCount(2, 2)
        assert parsed.dates == DateRange(check_in=date(2026, 8, 26), nights=2)
        assert parsed.dates.check_out == date(2026, 8, 28)
        assert parsed.budget == Decimal(25000)
        assert parsed.commission is True
        assert parsed.is_actionable

    @pytest.mark.asyncio
    async def test_today_is_given_to_the_model(self):
        # "Заезд сегодня" cannot be resolved without it, and a model left to
        # guess resolves it to whenever it thinks today is.
        gateway = StubGateway('{"kind": "noise"}')

        await ReadGroupMessageService(gateway).execute("Заезд сегодня", today=TODAY)

        assert "2026-08-26" in gateway.seen[0]

    @pytest.mark.asyncio
    async def test_an_empty_message_never_reaches_the_model(self):
        gateway = StubGateway('{"kind": "request"}')

        parsed = await ReadGroupMessageService(gateway).execute("   ", today=TODAY)

        assert parsed.kind is MessageKind.NOISE
        assert gateway.seen == []


class TestRanges:
    def test_a_room_range_is_kept_as_a_range(self):
        # "Комнат: 3-4 либо 2 двухкомнатные" — a flat with 3 rooms fits, one
        # with 5 does not.
        parsed = _coerce('{"kind": "request", "rooms_min": 3, "rooms_max": 4}', TODAY)

        assert parsed.rooms.matches(3)
        assert parsed.rooms.matches(4)
        assert not parsed.rooms.matches(2)
        assert not parsed.rooms.matches(5)

    def test_a_reversed_range_is_straightened_rather_than_dropped(self):
        parsed = _coerce('{"kind": "request", "rooms_min": 4, "rooms_max": 2}', TODAY)

        assert parsed.rooms == RoomCount(2, 4)

    def test_an_open_range_matches_anything_above_it(self):
        parsed = _coerce('{"kind": "request", "rooms_min": 2}', TODAY)

        assert parsed.rooms.matches(9)
        assert not parsed.rooms.matches(1)

    def test_nights_stand_in_for_a_check_out_nobody_wrote(self):
        parsed = _coerce('{"kind": "request", "check_in": "2026-08-26", "nights": 3}', TODAY)

        assert parsed.dates.check_out == date(2026, 8, 29)

    def test_a_stay_without_a_start_has_no_end(self):
        parsed = _coerce('{"kind": "request", "nights": 3}', TODAY)

        assert parsed.dates.check_out is None


class TestNonsenseFromTheModel:
    @pytest.mark.parametrize(
        "raw",
        [
            "",
            "не понял вопроса",
            "[1, 2, 3]",
            '{"kind": "приведи квартиру"}',
            '{"no_kind_at_all": true}',
        ],
    )
    def test_anything_unreadable_becomes_noise(self, raw):
        assert _coerce(raw, TODAY).kind is MessageKind.NOISE

    def test_fenced_json_is_unwrapped(self):
        raw = '```json\n{"kind": "request", "guests": 4}\n```'

        parsed = _coerce(raw, TODAY)

        assert parsed.kind is MessageKind.REQUEST
        assert parsed.guests == 4

    @pytest.mark.parametrize("rooms", [0, 40, -2, "две", None])
    def test_an_impossible_room_count_is_dropped_not_stored(self, rooms):
        parsed = _coerce(json.dumps({"kind": "request", "rooms_min": rooms}), TODAY)

        assert parsed.rooms.minimum is None

    @pytest.mark.parametrize("budget", ["договоримся", -5000, 0, None, True])
    def test_a_budget_that_is_not_money_is_dropped(self, budget):
        parsed = _coerce(json.dumps({"kind": "request", "budget": budget}), TODAY)

        assert parsed.budget is None

    def test_a_budget_written_with_spaces_survives(self):
        parsed = _coerce('{"kind": "request", "budget": "25 000"}', TODAY)

        assert parsed.budget == Decimal(25000)

    def test_a_stay_that_already_started_is_not_a_lead(self):
        # Reading a month-old message must not produce an actionable lead for
        # dates that have passed.
        parsed = _coerce('{"kind": "request", "check_in": "2026-07-01"}', TODAY)

        assert parsed.dates.check_in is None

    def test_yesterday_still_counts(self):
        # Groups run overnight; a message posted before midnight for "сегодня"
        # is read the next morning and is still worth answering.
        parsed = _coerce('{"kind": "request", "check_in": "2026-08-25"}', TODAY)

        assert parsed.dates.check_in == date(2026, 8, 25)

    def test_a_date_that_is_not_a_date_is_dropped(self):
        parsed = _coerce('{"kind": "request", "check_in": "завтра"}', TODAY)

        assert parsed.dates.check_in is None


class TestBlacklist:
    def test_a_warning_keeps_the_number_and_the_reason(self):
        parsed = _coerce(
            '{"kind": "blacklist", "phone": "+7 778 682 3184", "note": "Прокурили всю квартиру"}',
            TODAY,
        )

        assert parsed.kind is MessageKind.BLACKLIST
        assert parsed.phone == "+77786823184"
        assert parsed.note == "Прокурили всю квартиру"
        assert parsed.is_actionable

    def test_a_local_number_is_normalised(self):
        parsed = _coerce('{"kind": "blacklist", "phone": "8 702 689 3704"}', TODAY)

        assert parsed.phone == "+77026893704"

    @pytest.mark.parametrize("phone", ["", "нет номера", "12345", None])
    def test_a_warning_with_no_number_warns_nobody(self, phone):
        # It would match no guest and no booking, so it is not worth waking an
        # operator for.
        parsed = _coerce(json.dumps({"kind": "blacklist", "phone": phone}), TODAY)

        assert parsed.kind is MessageKind.NOISE


class TestQuietKinds:
    @pytest.mark.parametrize("kind", ["offer", "closing", "cleaning", "noise"])
    def test_they_carry_nothing_but_their_kind(self, kind):
        # Only requests and blacklist entries interrupt an operator. Extraction
        # for the rest would be paid-for detail nobody reads.
        parsed = _coerce(json.dumps({"kind": kind, "district": "Комфорт Сити"}), TODAY)

        assert parsed.kind is MessageKind(kind)
        assert parsed.district == ""
        assert not parsed.is_actionable


#: What the groups actually carry, counted over the whole export. The fixture
#: below is a deliberate sample, not these proportions: chatter is capped so the
#: file stays readable. Sizing the pipeline's model spend goes by these numbers.
REAL_TRAFFIC = {"lead_exchange": 177, "cleaning_exchange": 96, "neighbours": 888}


@pytest.fixture(scope="module")
def messages():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


class TestTheRealTraffic:
    """The fixture is 281 messages taken from the groups as they were."""

    def test_the_fixture_covers_all_three_kinds_of_group(self, messages):
        groups = {m["group"] for m in messages}

        assert groups == {"lead_exchange", "cleaning_exchange", "neighbours"}

    def test_no_real_phone_number_was_committed(self, messages):
        # These are other people's guests. The placeholders keep the shape of a
        # number without carrying anyone's.
        import re

        real = re.compile(r"\+7\s?(?!700\s000)\d{3}")
        offenders = [m["text"] for m in messages if real.search(m["text"])]

        assert offenders == []

    def test_the_sample_carries_every_kind_of_message_worth_reading(self, messages):
        # A request, an offer, a blacklist entry, a closing and a cleaning job
        # all have to survive the same pipeline, so all five have to be here.
        text = " ".join(m["text"].lower() for m in messages)

        assert "бюджет" in text  # request
        assert "чс" in text  # blacklist
        assert "достаточно" in text  # closing
        assert "уборка" in text  # cleaning
        assert "субаренду" in text  # offer

    def test_no_way_into_anyone_flat_was_committed(self, messages):
        # One message in the export said which flat the keys were under the mat
        # of. These are colleagues' flats, and this repository is public.
        import re

        access = re.compile(r"ключи под|кілт|домофон|код подъезда|консьерж", re.I)
        offenders = [m["text"] for m in messages if access.search(m["text"])]

        assert offenders == []

    def test_chatter_outweighs_leads_in_the_groups_themselves(self, messages):
        # Five sixths of what arrives is not a lead. The model is paid per
        # message, so the bill follows this number and not the lead count —
        # which is the argument for filtering cheaply before the model call.
        assert REAL_TRAFFIC["lead_exchange"] < sum(REAL_TRAFFIC.values()) / 5
