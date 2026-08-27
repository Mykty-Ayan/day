"""What to do with a message once it has been read.

The reader (`ReadGroupMessageService`) says what a message is. This decides what
that means for us: store a request, close what a colleague just cancelled,
record a warning about a guest, or let it go.

Nothing here answers anyone. The reply is drafted elsewhere and sent by a
person: these groups are moderated, and an account that posts by itself loses
both the account and the leads that came through it.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.application.leads.read_message import ReadGroupMessageService
from app.domain.leads.entities import BlacklistedGuest, Lead
from app.domain.leads.repositories import BlacklistRepository, LeadRepository
from app.domain.leads.value_objects import MessageKind, ParsedMessage


@dataclass
class IngestResult:
    parsed: ParsedMessage
    lead: Lead | None = None
    blacklisted: BlacklistedGuest | None = None
    closed_leads: int = 0

    @property
    def needs_operator(self) -> bool:
        """Whether a person should be interrupted for this."""
        return self.lead is not None or self.blacklisted is not None


class IngestGroupMessageService:
    def __init__(
        self,
        reader: ReadGroupMessageService,
        leads: LeadRepository,
        blacklist: BlacklistRepository,
    ) -> None:
        self._reader = reader
        self._leads = leads
        self._blacklist = blacklist

    async def execute(
        self,
        company_id: uuid.UUID,
        chat_id: str,
        author: str,
        text: str,
    ) -> IngestResult:
        parsed = await self._reader.execute(text)

        if parsed.kind is MessageKind.REQUEST:
            lead = await self._leads.add(
                Lead(
                    company_id=company_id,
                    chat_id=chat_id,
                    author=author,
                    text=text,
                    district=parsed.district,
                    guests=parsed.guests,
                    rooms_min=parsed.rooms.minimum,
                    rooms_max=parsed.rooms.maximum,
                    check_in=parsed.dates.check_in,
                    nights=parsed.dates.nights,
                    budget=parsed.budget,
                    commission=parsed.commission,
                )
            )
            return IngestResult(parsed=parsed, lead=lead)

        if parsed.kind is MessageKind.CLOSING:
            # "Достаточно спасибо выбирают больше не отправляйте" names neither
            # the request nor its dates. Who wrote it and where is all we have.
            closed = await self._leads.close_open_in_chat(company_id, chat_id, author)
            return IngestResult(parsed=parsed, closed_leads=closed)

        if parsed.kind is MessageKind.BLACKLIST:
            entry = await self._blacklist.add(
                BlacklistedGuest(
                    company_id=company_id,
                    phone=parsed.phone,
                    reason=parsed.note,
                    source=chat_id,
                )
            )
            return IngestResult(parsed=parsed, blacklisted=entry)

        return IngestResult(parsed=parsed)
