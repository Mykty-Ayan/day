"""Channel manager (Channex) endpoints.

The context is deliberately named ``channex`` — ``channels`` is already taken
by the messaging bots.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.channex.onboard_listing import OnboardListingInput
from app.application.channex.push_ari import PushAriInput
from app.domain.auth.permissions import Permission
from app.domain.channex.entities import ChannexListing
from app.infrastructure.channex.factory import (
    build_onboard_service,
    build_push_ari_service,
)
from app.infrastructure.database import get_session
from app.infrastructure.repositories.channex import SqlChannexListingRepository
from app.presentation.api.deps import get_company_id, require
from app.presentation.schemas.channex import (
    ListingListResponse,
    ListingResponse,
    OnboardListingRequest,
    PushAriRequest,
    PushAriResponse,
)

channex_router = APIRouter(prefix="/channex", tags=["channex"])


def _to_response(listing: ChannexListing) -> ListingResponse:
    return ListingResponse(
        id=listing.id,
        property_id=listing.property_id,
        channex_property_id=listing.channex_property_id,
        channex_room_type_id=listing.channex_room_type_id,
        channex_rate_plan_id=listing.channex_rate_plan_id,
        sync_state=listing.sync_state.value,
        last_error=listing.last_error,
        last_synced_at=listing.last_synced_at,
    )


@channex_router.post(
    "/listings",
    response_model=ListingResponse,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def onboard_listing(
    body: OnboardListingRequest,
    company_id: uuid.UUID = Depends(get_company_id),
    session: AsyncSession = Depends(get_session),
):
    service = build_onboard_service(session)
    try:
        listing = await service.execute(
            OnboardListingInput(
                company_id=company_id,
                property_id=body.property_id,
                currency=body.currency,
                country=body.country,
                city=body.city,
                zip_code=body.zip_code,
                timezone=body.timezone,
                contact_email=body.contact_email,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    await session.commit()
    return _to_response(listing)


@channex_router.get(
    "/listings",
    response_model=ListingListResponse,
    dependencies=[Depends(require(Permission.PROPERTIES_READ))],
)
async def list_listings(
    company_id: uuid.UUID = Depends(get_company_id),
    session: AsyncSession = Depends(get_session),
):
    listings = await SqlChannexListingRepository(session).list_by_company(company_id)
    return ListingListResponse(items=[_to_response(item) for item in listings])


@channex_router.post(
    "/listings/{property_id}/sync",
    response_model=PushAriResponse,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def push_ari(
    property_id: uuid.UUID,
    body: PushAriRequest,
    company_id: uuid.UUID = Depends(get_company_id),
    session: AsyncSession = Depends(get_session),
):
    service = build_push_ari_service(session)
    try:
        result = await service.execute(
            PushAriInput(
                company_id=company_id,
                property_id=property_id,
                date_from=body.date_from,
                date_to=body.date_to,
                rate=body.rate,
                min_stay=body.min_stay,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await session.commit()
    return PushAriResponse(days_pushed=result.days_pushed, blocked_dates=result.blocked_dates)
