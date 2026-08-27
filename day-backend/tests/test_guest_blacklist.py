"""Warning an operator about a guest colleagues flagged.

The money at stake is real: one message in the groups reports a 200 000 ₸ fine
for letting the wrong people in, which is several nights of revenue from a flat.

The thing this must never do is refuse a booking. The warning is hearsay from a
group chat, numbers get reassigned and mistyped, and a refusal the operator
cannot overrule turns someone else's gossip into our policy.
"""

from __future__ import annotations

import uuid

import pytest

from app.application.leads.check_guest import CheckGuestService, normalise_phone
from app.domain.leads.entities import BlacklistedGuest
from tests.test_lead_ingest import FakeBlacklist

COMPANY = uuid.UUID("00000000-0000-0000-0000-000000000001")
OTHER_COMPANY = uuid.UUID("00000000-0000-0000-0000-000000000002")


def service(*entries: BlacklistedGuest):
    store = FakeBlacklist()
    store.rows.extend(entries)
    return CheckGuestService(store)


def entry(phone="+77786823184", company=COMPANY, reason="Прокурили всю квартиру"):
    return BlacklistedGuest(company_id=company, phone=phone, reason=reason)


class TestNormalisation:
    @pytest.mark.parametrize(
        "raw",
        ["+7 778 682 3184", "87786823184", "8 (778) 682-31-84", "+77786823184", "7786823184"],
    )
    def test_every_way_people_write_it_lands_on_one_form(self, raw):
        # A warning posted as "+7 778 682 3184" has to meet a booking saved as
        # "87786823184", or the whole list matches nothing.
        assert normalise_phone(raw) == "+77786823184"

    @pytest.mark.parametrize("raw", ["", None, "не знаю", "123", "+1 415 555 0100"])
    def test_what_is_not_a_local_number_matches_nothing(self, raw):
        assert normalise_phone(raw) == ""


class TestTheWarning:
    @pytest.mark.asyncio
    async def test_a_flagged_number_produces_one(self):
        result = await service(entry()).execute(COMPANY, "8 778 682 31 84")

        assert result is not None
        assert result.reason == "Прокурили всю квартиру"
        assert "предупреждали" in result.for_operator

    @pytest.mark.asyncio
    async def test_an_unknown_number_produces_nothing(self):
        assert await service(entry()).execute(COMPANY, "+77019999999") is None

    @pytest.mark.asyncio
    async def test_a_booking_without_a_phone_is_not_a_warning(self):
        assert await service(entry()).execute(COMPANY, None) is None

    @pytest.mark.asyncio
    async def test_another_company_warnings_are_invisible(self):
        # Two subletters may sit in the same groups and disagree about a guest.
        # Neither gets to put the other's judgement on their screen.
        result = await service(entry(company=OTHER_COMPANY)).execute(COMPANY, "+77786823184")

        assert result is None

    @pytest.mark.asyncio
    async def test_a_warning_with_no_reason_still_says_something_useful(self):
        result = await service(entry(reason="")).execute(COMPANY, "+77786823184")

        assert result.for_operator == "Коллеги предупреждали об этом номере"

    @pytest.mark.asyncio
    async def test_the_text_is_written_for_the_operator_not_the_guest(self):
        # The groups are explicit that passing their contents to guests is what
        # gets people removed, and once got someone sued.
        result = await service(entry()).execute(COMPANY, "+77786823184")

        assert "чёрн" not in result.for_operator.lower()
        assert "чат" not in result.for_operator.lower()
