"""Personal links for guests, made by aidyn (the CRM, with its API key) or the operator."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.booking.guest_offers import GuestOffersService
from app.application.booking.price_calculator import PriceCalculatorService
from app.config import settings
from app.domain.auth.permissions import Permission
from app.infrastructure.database import get_session
from app.infrastructure.repositories.booking import SqlBookingRepository, SqlGuestOfferRepository
from app.infrastructure.repositories.property import (
    SqlDayPriceRepository,
    SqlDiscountRuleRepository,
    SqlPricingConfigRepository,
    SqlPropertyPhotoRepository,
    SqlPropertyRepository,
    SqlSeasonalPriceRepository,
)
from app.presentation.api.deps import Principal, get_company_id, get_principal, require
from app.presentation.schemas.offers import OfferCreate, OfferResponse

offers_router = APIRouter(prefix="/offers", tags=["offers"])


def offers_service(session: AsyncSession) -> GuestOffersService:
    return GuestOffersService(
        SqlGuestOfferRepository(session),
        SqlPropertyRepository(session),
        SqlPropertyPhotoRepository(session),
        SqlBookingRepository(session),
        PriceCalculatorService(
            SqlPricingConfigRepository(session),
            SqlSeasonalPriceRepository(session),
            SqlDiscountRuleRepository(session),
            SqlDayPriceRepository(session),
        ),
    )


@offers_router.post(
    "",
    response_model=OfferResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.BOOKINGS_WRITE))],
)
async def create_offer(
    body: OfferCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    """A personal link for a guest: the company's flats on sale for the guest's dates.
    The guest's name and phone stay in Day; the link holds only a random code, and
    the page shows the first name and a masked phone. It lasts until the check-in day."""
    try:
        offer = await offers_service(session).create(
            company_id,
            guest_name=body.guest_name,
            guest_phone=body.guest_phone,
            check_in=body.check_in,
            check_out=body.check_out,
            guests=body.guests,
            property_ids=body.property_ids,
            created_by=principal.actor_id,
        )
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404 if str(e) == "Property not found" else 422, detail=str(e))
    await session.commit()
    return OfferResponse(
        code=offer.code,
        url=f"{settings.PUBLIC_APP_URL.rstrip('/')}/o/{offer.code}",
        check_in=offer.check_in,
        check_out=offer.check_out,
        property_ids=offer.property_ids,
    )
