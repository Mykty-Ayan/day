"""Answering a colleague's request with our own free flats.

A lead in these groups lives minutes — the export carries "Первому отдала" and
"Достаточно спасибо выбирают больше не отправляйте". So the ranking decides
what the operator sees first, and the draft decides whether they can answer
before someone else does.

Two decisions are deliberately not filters, and the tests hold them that way:
district, because people write "возле гостиницы Казахстан" and a string match
against a stored address would silently drop flats that fit; and budget,
because a colleague who wrote 20 000 still takes a 22 000 flat when nothing
else is free.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.application.booking.check_availability import AvailableProperty
from app.application.leads.match import build_reply, match_request
from app.domain.leads.value_objects import DateRange, MessageKind, ParsedMessage, RoomCount
from app.domain.property.entities import Property


def flat(name: str, rooms: int | None, total: Decimal | None, block: str | None = None):
    prop = Property(
        id=uuid.uuid4(),
        company_id=uuid.uuid4(),
        name=name,
        rooms=rooms,
        block=block,
    )
    return AvailableProperty(property=prop, total_price=total)


def request(**kwargs) -> ParsedMessage:
    kwargs.setdefault("kind", MessageKind.REQUEST)
    return ParsedMessage(**kwargs)


class TestWhatCounts:
    def test_room_count_is_the_one_hard_filter(self):
        result = match_request(
            request(rooms=RoomCount(2, 2)),
            [flat("Двушка", 2, Decimal(20000)), flat("Трёшка", 3, Decimal(30000))],
        )

        assert [m.available.property.name for m in result.matches] == ["Двушка"]

    def test_a_flat_with_no_room_count_is_offered_rather_than_hidden(self):
        # An unfilled field in our own database is not evidence the flat is
        # wrong for the guest.
        result = match_request(request(rooms=RoomCount(2, 2)), [flat("Без данных", None, Decimal(20000))])

        assert result.has_answer

    def test_district_does_not_filter(self):
        # "возле гостиницы Казахстан", "Абая Гагарина Жарокова" — a person reads
        # that in a second, a string comparison throws away real matches.
        result = match_request(
            request(district="возле гостиницы Казахстан"),
            [flat("Auezov City", 2, Decimal(20000))],
        )

        assert result.has_answer

    def test_a_message_that_is_not_a_request_matches_nothing(self):
        result = match_request(
            ParsedMessage(kind=MessageKind.CLEANING),
            [flat("Двушка", 2, Decimal(20000))],
        )

        assert result.matches == ()


class TestBudget:
    def test_the_price_is_compared_per_night_not_per_stay(self):
        # "Бюджет 25-30" means per night. A three-night total of 60 000 is
        # inside a 25 000 budget, and comparing totals would reject it.
        result = match_request(
            request(budget=Decimal(25000), dates=DateRange(nights=3)),
            [flat("Двушка", 2, Decimal(60000))],
        )

        assert result.matches[0].price_per_night == Decimal(20000)
        assert result.matches[0].within_budget

    def test_over_budget_is_still_offered_but_sorted_last(self):
        result = match_request(
            request(budget=Decimal(20000)),
            [flat("Дорогая", 2, Decimal(30000)), flat("Дешёвая", 2, Decimal(18000))],
        )

        assert [m.available.property.name for m in result.matches] == ["Дешёвая", "Дорогая"]
        assert result.matches[1].within_budget is False

    def test_cheaper_comes_first_inside_the_budget(self):
        result = match_request(
            request(budget=Decimal(30000)),
            [flat("Средняя", 2, Decimal(25000)), flat("Дешёвая", 2, Decimal(18000))],
        )

        assert [m.available.property.name for m in result.matches] == ["Дешёвая", "Средняя"]

    def test_no_budget_named_means_nothing_is_over_it(self):
        # Half the requests name no budget. Treating those as over budget would
        # bury every one of them.
        result = match_request(request(), [flat("Любая", 2, Decimal(99000))])

        assert result.matches[0].within_budget

    def test_a_flat_we_cannot_price_sorts_last_but_stays(self):
        result = match_request(
            request(budget=Decimal(20000)),
            [flat("Без цены", 2, None), flat("С ценой", 2, Decimal(15000))],
        )

        assert [m.available.property.name for m in result.matches] == ["С ценой", "Без цены"]
        assert result.matches[1].price_per_night is None


class TestTheDraft:
    def test_it_reads_like_the_room_it_is_sent_into(self):
        result = match_request(
            request(budget=Decimal(25000), dates=DateRange(nights=1)),
            [flat("Auezov City", 2, Decimal(20000), block="11")],
        )

        text = build_reply(result)

        assert text == (
            "Здравствуйте! По вашей заявке свободно:\n"
            "— Auezov City, 2-комн, блок 11 — 20 000 ₸/ночь"
        )

    def test_a_commission_offered_is_accepted_in_the_draft(self):
        # "Бюджет ваш с %" — answering the money question in the first message
        # saves a round trip while the lead is still alive.
        result = match_request(
            request(commission=True),
            [flat("Двушка", 2, Decimal(20000))],
        )

        assert build_reply(result).endswith("Процент ваш.")

    def test_nothing_free_produces_no_draft_at_all(self):
        # A draft saying "ничего нет" gets sent by accident and is worth less
        # than silence.
        result = match_request(request(rooms=RoomCount(5, 5)), [flat("Двушка", 2, Decimal(20000))])

        assert build_reply(result) == ""

    def test_it_offers_three_flats_at_most(self):
        # Colleagues close requests with "достаточно, больше не отправляйте".
        # A wall of options is what provokes that.
        flats = [flat(f"Кв {i}", 2, Decimal(20000 + i)) for i in range(6)]

        text = build_reply(match_request(request(), flats))

        assert len([line for line in text.splitlines() if line.startswith("—")]) == 3

    def test_a_flat_without_a_price_says_so_rather_than_inventing_one(self):
        result = match_request(request(), [flat("Без цены", 2, None)])

        assert "цену уточню" in build_reply(result)

    @pytest.mark.parametrize("kind", [MessageKind.NOISE, MessageKind.OFFER, MessageKind.CLOSING])
    def test_quiet_kinds_never_produce_a_draft(self, kind):
        assert build_reply(match_request(ParsedMessage(kind=kind), [])) == ""
