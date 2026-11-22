"""A company's public site: the owner sets it up, a guest opens it at /c/<slug>."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.booking.price_calculator import has_tariffs
from app.application.property.public_stay import public_nights, taken_nights
from app.domain.auth.permissions import Permission
from app.domain.booking.value_objects import RentalMode
from app.domain.property.value_objects import FactAudience, PropertyStatus
from app.domain.settings.entities import DEFAULT_TIME_ZONE, DEFAULT_WEEKEND_NIGHTS, CompanySettings
from app.domain.site.entities import CompanySite
from app.domain.site.repositories import SlugTakenError
from app.infrastructure.database import get_session
from app.infrastructure.repositories.booking import SqlBookingRepository
from app.infrastructure.repositories.property import (
    SqlCompanyFactRepository,
    SqlDayPriceRepository,
    SqlPricingConfigRepository,
    SqlPropertyPhotoRepository,
    SqlPropertyRepository,
    SqlSeasonalPriceRepository,
)
from app.infrastructure.repositories.settings import SqlCompanySettingsRepository
from app.infrastructure.repositories.site import SqlCompanySiteRepository
from app.presentation.api.deps import get_company_id, require
from app.presentation.schemas.site import PublicCompanyFlat, PublicCompanyResponse, SiteResponse, SiteUpdate

site_router = APIRouter(prefix="/site", tags=["site"])
public_company_router = APIRouter(prefix="/public/companies", tags=["public"])

# A company page lists its flats on one screen; more is a catalogue, not a page.
MAX_FLATS = 100


@site_router.get("", response_model=SiteResponse | None, dependencies=[Depends(require(Permission.SETTINGS_READ))])
async def get_site(
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    """The company's site, or null before the owner sets one up."""
    site = await SqlCompanySiteRepository(session).get(company_id)
    return SiteResponse.model_validate(site, from_attributes=True) if site else None


@site_router.put("", response_model=SiteResponse, dependencies=[Depends(require(Permission.SETTINGS_WRITE))])
async def save_site(
    body: SiteUpdate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    """Set up or change the site. 409 when another company has the address."""
    try:
        site = await SqlCompanySiteRepository(session).save(CompanySite(company_id=company_id, **body.model_dump()))
    except SlugTakenError:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This address is taken")
    await session.commit()
    return SiteResponse.model_validate(site, from_attributes=True)


# How far ahead «free from» looks: a flat taken longer says nothing.
FREE_AHEAD_DAYS = 60
# A search by dates: as many nights as a stay on the site holds, and no further than a year ahead.
MAX_SEARCH_NIGHTS = 30
MAX_SEARCH_AHEAD_DAYS = 365


def company_today(company: CompanySettings | None) -> date:
    zone = ZoneInfo(company.time_zone if company and company.time_zone else DEFAULT_TIME_ZONE)
    return datetime.now(tz=zone).date()


def _days(first: date, count: int) -> list[date]:
    return [first + timedelta(days=n) for n in range(count)]


@public_company_router.get("/{slug}", response_model=PublicCompanyResponse)
async def public_company(
    slug: str,
    check_in: date | None = Query(default=None),
    check_out: date | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    """The company's page for guests, with no sign-in: the slug is the key. With the guest's
    dates each flat let by the night says whether it is free for them and what all the nights cost."""
    site = await SqlCompanySiteRepository(session).get_by_slug(slug.lower())
    if site is None:
        raise HTTPException(status_code=404, detail="Not found")
    properties, photos = SqlPropertyRepository(session), SqlPropertyPhotoRepository(session)
    pricing = SqlPricingConfigRepository(session)
    bookings = SqlBookingRepository(session)
    # «Free tonight» is the company's night: its own day, whatever the server's zone.
    company = await SqlCompanySettingsRepository(session).get_by_company(site.company_id)
    today = company_today(company)
    if (check_in is None) != (check_out is None):
        raise HTTPException(status_code=422, detail="Both check_in and check_out, or neither")
    if check_in and check_out:
        if not (today <= check_in < check_out <= check_in + timedelta(days=MAX_SEARCH_NIGHTS)):
            raise HTTPException(status_code=422, detail=f"From today, 1 to {MAX_SEARCH_NIGHTS} nights")
        if check_in > today + timedelta(days=MAX_SEARCH_AHEAD_DAYS):
            raise HTTPException(status_code=422, detail="No further than a year ahead")
    weekend = company.weekend_nights if company else DEFAULT_WEEKEND_NIGHTS
    seasonals, day_prices = SqlSeasonalPriceRepository(session), SqlDayPriceRepository(session)
    flats = []
    # A few queries a flat; a company has a handful of them.
    for prop in await properties.list_by_company(site.company_id, status=PropertyStatus.ACTIVE, limit=MAX_FLATS):
        shown = sorted(
            (p for p in await photos.list_by_property(prop.id) if p.audience == FactAudience.PUBLIC),
            key=lambda p: (not p.is_cover, p.sort_order),
        )
        price = await pricing.get_by_property(prop.id)
        free_from = None
        if prop.rental_mode != RentalMode.HOURLY:
            taken = await taken_nights(bookings, prop, today, today + timedelta(days=FREE_AHEAD_DAYS))
            free_from = next((d for d in _days(today, FREE_AHEAD_DAYS) if d not in taken), None)
        stay_free, stay_total = None, None
        if check_in and check_out:
            # Free for the dates: every night free, as many nights as the flat takes, priced by the night.
            stay_free = False
            if prop.rental_mode != RentalMode.HOURLY and price and price.base_price > 0:
                nights = await public_nights(prop, price, seasonals, day_prices, bookings, check_in, check_out, weekend)
                fits = (prop.min_nights is None or len(nights) >= prop.min_nights) and (
                    prop.max_nights is None or len(nights) <= prop.max_nights
                )
                if fits and all(n.free for n in nights):
                    stay_free, stay_total = True, float(sum(n.price for n in nights))
        flats.append(
            PublicCompanyFlat(
                code=prop.public_code,
                name=prop.name,
                complex_name=prop.complex_name,
                rooms=prop.rooms,
                max_guests=prop.max_guests,
                area_total=prop.area_total,
                photo=shown[0].url if shown else None,
                photos=len(shown),
                free_from=free_from,
                stay_free=stay_free,
                stay_total=stay_total,
                night_price=float(price.base_price)
                if price and prop.rental_mode != RentalMode.HOURLY and price.base_price > 0
                else None,
                # Tariffs replace the price of an hour: an hourly price left over would be wrong.
                hour_price=float(price.hourly_price)
                if price and prop.rental_mode != RentalMode.DAILY and price.hourly_price > 0 and not has_tariffs(price)
                else None,
            )
        )
    rules = [
        f.text
        for f in await SqlCompanyFactRepository(session).list_by_company(site.company_id)
        if f.audience == FactAudience.PUBLIC
    ]
    return PublicCompanyResponse(
        **SiteResponse.model_validate(site, from_attributes=True).model_dump(exclude={"updated_at"}),
        rules=rules,
        flats=flats,
        today=today,
    )
