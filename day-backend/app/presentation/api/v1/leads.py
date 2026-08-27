"""Leads read out of the colleagues' groups, and the guests they warn about.

Two things live here and they answer to different permissions. A lead is
commercial: who wants a flat, when, for how much. A warning is about a person,
carries someone's phone number, and came out of a chat whose members are
explicit that passing its contents on is what gets people removed.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.leads.check_guest import CheckGuestService, normalise_phone
from app.domain.auth.permissions import Permission
from app.domain.leads.entities import BlacklistedGuest, LeadStatus
from app.infrastructure.database import get_session
from app.infrastructure.repositories.leads import SqlBlacklistRepository, SqlLeadRepository
from app.presentation.api.deps import get_company_id, require
from app.presentation.schemas.leads import (
    BlacklistEntryCreate,
    BlacklistEntryResponse,
    GuestCheckResponse,
    LeadResponse,
    LeadStatusUpdate,
)

lead_router = APIRouter(prefix="/leads", tags=["leads"])
blacklist_router = APIRouter(prefix="/blacklist", tags=["blacklist"])


@lead_router.get(
    "",
    response_model=list[LeadResponse],
    dependencies=[Depends(require(Permission.BOOKINGS_READ))],
)
async def list_leads(
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    leads = await SqlLeadRepository(session).list_open(company_id, limit=limit)
    return [LeadResponse.model_validate(x, from_attributes=True) for x in leads]


@lead_router.post(
    "/{lead_id}/status",
    response_model=LeadResponse,
    dependencies=[Depends(require(Permission.BOOKINGS_WRITE))],
)
async def set_lead_status(
    lead_id: uuid.UUID,
    body: LeadStatusUpdate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    updated = await SqlLeadRepository(session).set_status(
        company_id, lead_id, LeadStatus(body.status)
    )
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    await session.commit()
    return LeadResponse.model_validate(updated, from_attributes=True)


@blacklist_router.get(
    "",
    response_model=list[BlacklistEntryResponse],
    dependencies=[Depends(require(Permission.BOOKINGS_READ))],
)
async def list_blacklist(
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    rows = await SqlBlacklistRepository(session).list_all(company_id)
    return [BlacklistEntryResponse.model_validate(x, from_attributes=True) for x in rows]


@blacklist_router.get(
    "/check",
    response_model=GuestCheckResponse,
    dependencies=[Depends(require(Permission.BOOKINGS_READ))],
)
async def check_guest(
    phone: str = Query(..., min_length=3),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    """Ask before confirming a booking. Answers, never refuses.

    The warning is hearsay from a group chat and a number can be reassigned or
    mistyped, so the decision stays with the operator.
    """
    warning = await CheckGuestService(SqlBlacklistRepository(session)).execute(company_id, phone)
    return GuestCheckResponse(
        warned=warning is not None,
        message=warning.for_operator if warning else "",
    )


@blacklist_router.post(
    "",
    response_model=BlacklistEntryResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require(Permission.BOOKINGS_WRITE))],
)
async def add_to_blacklist(
    body: BlacklistEntryCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    phone = normalise_phone(body.phone)
    if not phone:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Нужен номер в формате +7XXXXXXXXXX",
        )
    saved = await SqlBlacklistRepository(session).add(
        BlacklistedGuest(company_id=company_id, phone=phone, reason=body.reason)
    )
    await session.commit()
    return BlacklistEntryResponse.model_validate(saved, from_attributes=True)


@blacklist_router.delete(
    "/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require(Permission.BOOKINGS_WRITE))],
)
async def remove_from_blacklist(
    entry_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    """Warnings are hearsay, and people are wrong. Removing one must be easy."""
    if not await SqlBlacklistRepository(session).remove(company_id, entry_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    await session.commit()
