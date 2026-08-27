"""Storing leads and guest warnings.

Every query is scoped by company_id, without exception. A lead carries a
colleague's guest and their budget, and a warning carries someone's phone
number: leaking either across tenants is the worst thing this table can do.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.leads.entities import BlacklistedGuest, Lead, LeadStatus
from app.domain.leads.repositories import BlacklistRepository, LeadRepository
from app.infrastructure.models.leads import BlacklistedGuestModel, LeadModel


def _to_lead(m: LeadModel) -> Lead:
    return Lead(
        id=m.id,
        company_id=m.company_id,
        chat_id=m.chat_id,
        author=m.author,
        text=m.text,
        district=m.district,
        guests=m.guests,
        rooms_min=m.rooms_min,
        rooms_max=m.rooms_max,
        check_in=m.check_in,
        nights=m.nights,
        budget=Decimal(str(m.budget)) if m.budget is not None else None,
        commission=m.commission,
        status=LeadStatus(m.status),
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _to_entry(m: BlacklistedGuestModel) -> BlacklistedGuest:
    return BlacklistedGuest(
        id=m.id,
        company_id=m.company_id,
        phone=m.phone,
        reason=m.reason,
        source=m.source,
        created_at=m.created_at,
    )


class SqlLeadRepository(LeadRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, lead: Lead) -> Lead:
        model = LeadModel(
            id=lead.id,
            company_id=lead.company_id,
            chat_id=lead.chat_id,
            author=lead.author,
            text=lead.text,
            district=lead.district,
            guests=lead.guests,
            rooms_min=lead.rooms_min,
            rooms_max=lead.rooms_max,
            check_in=lead.check_in,
            nights=lead.nights,
            budget=lead.budget,
            commission=lead.commission,
            status=lead.status.value,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _to_lead(model)

    async def get(self, company_id: uuid.UUID, lead_id: uuid.UUID) -> Lead | None:
        model = await self._session.scalar(
            select(LeadModel).where(
                LeadModel.id == lead_id, LeadModel.company_id == company_id
            )
        )
        return _to_lead(model) if model else None

    async def list_open(self, company_id: uuid.UUID, limit: int = 50) -> list[Lead]:
        stmt = (
            select(LeadModel)
            .where(
                LeadModel.company_id == company_id,
                LeadModel.status.in_([LeadStatus.NEW.value, LeadStatus.ANSWERED.value]),
            )
            .order_by(LeadModel.created_at.desc())
            .limit(limit)
        )
        rows = await self._session.scalars(stmt)
        return [_to_lead(m) for m in rows.all()]

    async def set_status(
        self, company_id: uuid.UUID, lead_id: uuid.UUID, status: LeadStatus
    ) -> Lead | None:
        await self._session.execute(
            update(LeadModel)
            .where(LeadModel.id == lead_id, LeadModel.company_id == company_id)
            .values(status=status.value, updated_at=datetime.utcnow())
        )
        await self._session.flush()
        return await self.get(company_id, lead_id)

    async def close_open_in_chat(self, company_id: uuid.UUID, chat_id: str, author: str) -> int:
        result = await self._session.execute(
            update(LeadModel)
            .where(
                LeadModel.company_id == company_id,
                LeadModel.chat_id == chat_id,
                LeadModel.author == author,
                LeadModel.status.in_([LeadStatus.NEW.value, LeadStatus.ANSWERED.value]),
            )
            .values(status=LeadStatus.CLOSED.value, updated_at=datetime.utcnow())
        )
        await self._session.flush()
        return result.rowcount or 0

    async def count_for_date(self, company_id: uuid.UUID, check_in: date) -> int:
        rows = await self._session.scalars(
            select(LeadModel.id).where(
                LeadModel.company_id == company_id,
                LeadModel.check_in == check_in,
                LeadModel.status.in_([LeadStatus.NEW.value, LeadStatus.ANSWERED.value]),
            )
        )
        return len(rows.all())


class SqlBlacklistRepository(BlacklistRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, entry: BlacklistedGuest) -> BlacklistedGuest:
        existing = await self._session.scalar(
            select(BlacklistedGuestModel).where(
                BlacklistedGuestModel.company_id == entry.company_id,
                BlacklistedGuestModel.phone == entry.phone,
            )
        )
        if existing is not None:
            # A second sighting sharpens the reason rather than stacking rows
            # that all say the same number is trouble.
            existing.reason = entry.reason or existing.reason
            existing.source = entry.source or existing.source
            await self._session.flush()
            return _to_entry(existing)

        model = BlacklistedGuestModel(
            id=entry.id,
            company_id=entry.company_id,
            phone=entry.phone,
            reason=entry.reason,
            source=entry.source,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _to_entry(model)

    async def find(self, company_id: uuid.UUID, phone: str) -> BlacklistedGuest | None:
        if not phone:
            return None
        model = await self._session.scalar(
            select(BlacklistedGuestModel).where(
                BlacklistedGuestModel.company_id == company_id,
                BlacklistedGuestModel.phone == phone,
            )
        )
        return _to_entry(model) if model else None

    async def list_all(
        self, company_id: uuid.UUID, limit: int = 200
    ) -> Sequence[BlacklistedGuest]:
        rows = await self._session.scalars(
            select(BlacklistedGuestModel)
            .where(BlacklistedGuestModel.company_id == company_id)
            .order_by(BlacklistedGuestModel.created_at.desc())
            .limit(limit)
        )
        return [_to_entry(m) for m in rows.all()]

    async def remove(self, company_id: uuid.UUID, entry_id: uuid.UUID) -> bool:
        result = await self._session.execute(
            delete(BlacklistedGuestModel).where(
                BlacklistedGuestModel.id == entry_id,
                BlacklistedGuestModel.company_id == company_id,
            )
        )
        await self._session.flush()
        return bool(result.rowcount)
