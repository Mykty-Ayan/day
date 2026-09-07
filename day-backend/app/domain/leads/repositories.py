"""Ports for storing leads and the guests we were warned about."""

from __future__ import annotations

import abc
import uuid
from collections.abc import Sequence

from app.domain.leads.entities import BlacklistedGuest, Lead, LeadStatus


class LeadRepository(abc.ABC):
    @abc.abstractmethod
    async def add(self, lead: Lead) -> Lead: ...

    @abc.abstractmethod
    async def get(self, company_id: uuid.UUID, lead_id: uuid.UUID) -> Lead | None: ...

    @abc.abstractmethod
    async def list_open(self, company_id: uuid.UUID, limit: int = 50) -> list[Lead]:
        """Leads still worth answering, newest first."""

    @abc.abstractmethod
    async def set_status(
        self, company_id: uuid.UUID, lead_id: uuid.UUID, status: LeadStatus
    ) -> Lead | None: ...

    @abc.abstractmethod
    async def close_open_in_chat(self, company_id: uuid.UUID, chat_id: str, author: str) -> int:
        """Close what this author still has open in this chat.

        Colleagues close their own requests in the group — "достаточно, больше
        не отправляйте" — without quoting which one. The author and the chat are
        all the message gives us, so that is what the close matches on.
        Returns how many were closed.
        """

    @abc.abstractmethod
    async def count_for_date(self, company_id: uuid.UUID, check_in) -> int:
        """Open requests for one date, as a demand signal for pricing."""


class BlacklistRepository(abc.ABC):
    @abc.abstractmethod
    async def add(self, entry: BlacklistedGuest) -> BlacklistedGuest: ...

    @abc.abstractmethod
    async def find(self, company_id: uuid.UUID, phone: str) -> BlacklistedGuest | None: ...

    @abc.abstractmethod
    async def list_all(self, company_id: uuid.UUID, limit: int = 200) -> Sequence[BlacklistedGuest]: ...

    @abc.abstractmethod
    async def remove(self, company_id: uuid.UUID, entry_id: uuid.UUID) -> bool:
        """A warning must be removable: they are hearsay, and people are wrong."""
