"""Pages for guests, opened by a link with no sign-in (no company in the request:
the code in the link is the key, and it names one flat of one company)."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.property.public_stay import GetPublicStayService
from app.infrastructure.database import get_session
from app.infrastructure.repositories.booking import SqlBookingRepository
from app.infrastructure.repositories.property import (
    SqlAmenityRepository,
    SqlDayPriceRepository,
    SqlPricingConfigRepository,
    SqlPropertyPhotoRepository,
    SqlPropertyRepository,
    SqlSeasonalPriceRepository,
)
from app.presentation.schemas.public import PublicStayResponse

public_router = APIRouter(prefix="/public", tags=["public"])

# Two months on screen and a bit; more is a crawl, not a guest.
_MAX_NIGHTS = 120
_DEFAULT_NIGHTS = 62


@public_router.get("/stays/{code}", response_model=PublicStayResponse)
async def public_stay(
    code: str,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """A flat's page for guests: the flat, its prices and its nights in [date_from, date_to)."""
    start = date_from or date.today()
    end = date_to or start + timedelta(days=_DEFAULT_NIGHTS)
    if not 0 < (end - start).days <= _MAX_NIGHTS:
        raise HTTPException(status_code=422, detail=f"date_to must be after date_from, at most {_MAX_NIGHTS} nights")
    service = GetPublicStayService(
        SqlPropertyRepository(session),
        SqlPropertyPhotoRepository(session),
        SqlAmenityRepository(session),
        SqlPricingConfigRepository(session),
        SqlSeasonalPriceRepository(session),
        SqlDayPriceRepository(session),
        SqlBookingRepository(session),
    )
    try:
        stay = await service.execute(code, start, end)
    except ValueError:
        # The same answer for a wrong code and a flat not on sale: the code is the key.
        raise HTTPException(status_code=404, detail="Not found")
    return PublicStayResponse.from_stay(stay)
