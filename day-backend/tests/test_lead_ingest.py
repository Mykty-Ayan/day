"""What happens to a group message after it has been read.

The reader decides what a message is; this decides what it means for us. The
cases that matter are the ones where doing nothing is right — five of every six
messages in these groups are chatter — and the one where a colleague cancels a
request without saying which.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.application.leads.ingest import IngestGroupMessageService
from app.application.leads.read_message import ReadGroupMessageService
from app.domain.assistant.gateway import ModelResponse
from app.domain.leads.entities import BlacklistedGuest, Lead, LeadStatus
from app.domain.leads.repositories import BlacklistRepository, LeadRepository

COMPANY = uuid.UUID("00000000-0000-0000-0000-000000000001")
CHAT = "120363041576997509@g.us"
AUTHOR = "77011234567"


class StubGateway:
    def __init__(self, reply: str) -> None:
        self._reply = reply

    async def complete(self, messages, tools):
        return ModelResponse(text=self._reply)


class FakeLeads(LeadRepository):
    def __init__(self) -> None:
        self.rows: list[Lead] = []

    async def add(self, lead: Lead) -> Lead:
        self.rows.append(lead)
        return lead

    async def get(self, company_id, lead_id):
        return next((x for x in self.rows if x.id == lead_id and x.company_id == company_id), None)

    async def list_open(self, company_id, limit=50):
        return [x for x in self.rows if x.company_id == company_id and x.status is LeadStatus.NEW]

    async def set_status(self, company_id, lead_id, status):
        lead = await self.get(company_id, lead_id)
        if lead:
            lead.status = status
        return lead

    async def close_open_in_chat(self, company_id, chat_id, author) -> int:
        closed = 0
        for lead in self.rows:
            if (
                lead.company_id == company_id
                and lead.chat_id == chat_id
                and lead.author == author
                and lead.status in (LeadStatus.NEW, LeadStatus.ANSWERED)
            ):
                lead.status = LeadStatus.CLOSED
                closed += 1
        return closed

    async def count_for_date(self, company_id, check_in) -> int:
        return len(
            [
                x
                for x in self.rows
                if x.company_id == company_id
                and x.check_in == check_in
                and x.status is LeadStatus.NEW
            ]
        )


class FakeBlacklist(BlacklistRepository):
    def __init__(self) -> None:
        self.rows: list[BlacklistedGuest] = []

    async def add(self, entry: BlacklistedGuest) -> BlacklistedGuest:
        for existing in self.rows:
            if existing.company_id == entry.company_id and existing.phone == entry.phone:
                existing.reason = entry.reason or existing.reason
                return existing
        self.rows.append(entry)
        return entry

    async def find(self, company_id, phone):
        return next(
            (x for x in self.rows if x.company_id == company_id and x.phone == phone), None
        )

    async def list_all(self, company_id, limit=200):
        return [x for x in self.rows if x.company_id == company_id]

    async def remove(self, company_id, entry_id) -> bool:
        before = len(self.rows)
        self.rows = [
            x for x in self.rows if not (x.id == entry_id and x.company_id == company_id)
        ]
        return len(self.rows) < before


def service(model_reply: str, leads: FakeLeads | None = None, blacklist: FakeBlacklist | None = None):
    """A service over the given stores, or fresh ones.

    Passing the stores in is how a test plays two messages in a row — a request
    and then its cancellation — against the same data.
    """
    leads = leads if leads is not None else FakeLeads()
    blacklist = blacklist if blacklist is not None else FakeBlacklist()
    reader = ReadGroupMessageService(StubGateway(model_reply))
    return IngestGroupMessageService(reader, leads, blacklist), leads, blacklist


class TestARequest:
    @pytest.mark.asyncio
    async def test_it_is_stored_with_the_original_text(self):
        # Every parse is a guess. Whoever decides on the lead has to be able to
        # read what the colleague actually wrote.
        original = "Коктем 3, 2 ком, заезд сегодня, 2 суток, до 30 с%"
        svc, leads, _ = service(
            '{"kind": "request", "district": "Коктем 3", "rooms_min": 2, "rooms_max": 2,'
            ' "check_in": "2026-08-27", "nights": 2, "budget": 30000, "commission": true}'
        )

        result = await svc.execute(COMPANY, CHAT, AUTHOR, original)

        assert result.lead is not None
        assert result.lead.text == original
        assert result.lead.budget == Decimal(30000)
        assert result.lead.commission is True
        assert result.lead.status is LeadStatus.NEW
        assert result.needs_operator
        assert leads.rows == [result.lead]

    @pytest.mark.asyncio
    async def test_the_author_and_chat_are_kept_so_the_answer_can_be_private(self):
        svc, _, _ = service('{"kind": "request"}')

        result = await svc.execute(COMPANY, CHAT, AUTHOR, "нужна двушка")

        assert result.lead.chat_id == CHAT
        assert result.lead.author == AUTHOR


class TestClosing:
    @pytest.mark.asyncio
    async def test_it_closes_what_that_author_had_open_in_that_chat(self):
        # "Достаточно спасибо выбирают больше не отправляйте" names neither the
        # request nor its dates.
        svc, leads, _ = service('{"kind": "request"}')
        await svc.execute(COMPANY, CHAT, AUTHOR, "нужна двушка")
        await svc.execute(COMPANY, CHAT, AUTHOR, "и ещё трёшка")

        closing, _, _ = service('{"kind": "closing"}', leads=leads)
        result = await closing.execute(COMPANY, CHAT, AUTHOR, "Достаточно, спасибо")

        assert result.closed_leads == 2
        assert all(x.status is LeadStatus.CLOSED for x in leads.rows)
        assert not result.needs_operator

    @pytest.mark.asyncio
    async def test_it_does_not_close_someone_else_requests(self):
        svc, leads, _ = service('{"kind": "request"}')
        await svc.execute(COMPANY, CHAT, "77019999999", "нужна двушка")

        closing, _, _ = service('{"kind": "closing"}', leads=leads)
        result = await closing.execute(COMPANY, CHAT, AUTHOR, "Достаточно")

        assert result.closed_leads == 0
        assert leads.rows[0].status is LeadStatus.NEW


class TestBlacklist:
    @pytest.mark.asyncio
    async def test_a_warning_is_recorded_against_the_number(self):
        svc, _, blacklist = service(
            '{"kind": "blacklist", "phone": "+7 778 682 3184", "note": "Прокурили всю квартиру"}'
        )

        result = await svc.execute(COMPANY, CHAT, AUTHOR, "+7 778 682 3184 ЧС прокурили")

        assert result.blacklisted.phone == "+77786823184"
        assert result.blacklisted.reason == "Прокурили всю квартиру"
        assert result.blacklisted.source == CHAT
        assert result.needs_operator

    @pytest.mark.asyncio
    async def test_a_second_sighting_sharpens_the_reason_instead_of_stacking(self):
        svc, _, blacklist = service(
            '{"kind": "blacklist", "phone": "+77786823184", "note": "Шумели всю ночь"}'
        )
        await svc.execute(COMPANY, CHAT, AUTHOR, "первый раз")
        await svc.execute(COMPANY, CHAT, AUTHOR, "второй раз")

        assert len(blacklist.rows) == 1


class TestTheQuietMajority:
    @pytest.mark.parametrize("kind", ["offer", "cleaning", "noise"])
    @pytest.mark.asyncio
    async def test_nothing_is_stored_and_nobody_is_woken(self, kind):
        # Five of every six messages in these groups are not ours to act on.
        svc, leads, blacklist = service('{"kind": "%s"}' % kind)

        result = await svc.execute(COMPANY, CHAT, AUTHOR, "какой-то текст")

        assert leads.rows == []
        assert blacklist.rows == []
        assert not result.needs_operator


class TestStaleness:
    def test_a_request_for_a_date_that_passed_is_not_worth_showing(self):
        from datetime import datetime

        lead = Lead(check_in=date(2026, 8, 20), created_at=datetime(2026, 8, 20, 10, 0))

        assert lead.is_stale(datetime(2026, 8, 27, 9, 0))

    def test_a_request_from_yesterday_is_already_gone(self):
        # "Первому отдала" — these are taken within minutes. A day-old lead is a
        # record, not a task.
        from datetime import datetime

        lead = Lead(check_in=date(2026, 9, 1), created_at=datetime(2026, 8, 25, 10, 0))

        assert lead.is_stale(datetime(2026, 8, 27, 9, 0))

    def test_a_fresh_one_for_a_future_date_is_live(self):
        from datetime import datetime

        lead = Lead(check_in=date(2026, 9, 1), created_at=datetime(2026, 8, 27, 8, 0))

        assert not lead.is_stale(datetime(2026, 8, 27, 9, 0))
