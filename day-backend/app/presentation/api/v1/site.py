"""A company's public site: the owner sets it up, a guest opens it at /c/<slug>."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.booking.price_calculator import has_tariffs
from app.domain.auth.permissions import Permission
from app.domain.booking.value_objects import RentalMode
from app.domain.property.value_objects import FactAudience, PropertyStatus
from app.domain.site.entities import CompanySite
from app.domain.site.repositories import SlugTakenError
from app.infrastructure.database import get_session
from app.infrastructure.repositories.property import (
    SqlCompanyFactRepository,
    SqlPricingConfigRepository,
    SqlPropertyPhotoRepository,
    SqlPropertyRepository,
)
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


@public_company_router.get("/{slug}", response_model=PublicCompanyResponse)
async def public_company(slug: str, session: AsyncSession = Depends(get_session)):
    """The company's page for guests, with no sign-in: the slug is the key."""
    site = await SqlCompanySiteRepository(session).get_by_slug(slug.lower())
    if site is None:
        raise HTTPException(status_code=404, detail="Not found")
    properties, photos = SqlPropertyRepository(session), SqlPropertyPhotoRepository(session)
    pricing = SqlPricingConfigRepository(session)
    flats = []
    # A few queries a flat; a company has a handful of them.
    for prop in await properties.list_by_company(site.company_id, status=PropertyStatus.ACTIVE, limit=MAX_FLATS):
        shown = sorted(
            (p for p in await photos.list_by_property(prop.id) if p.audience == FactAudience.PUBLIC),
            key=lambda p: (not p.is_cover, p.sort_order),
        )
        price = await pricing.get_by_property(prop.id)
        flats.append(
            PublicCompanyFlat(
                code=prop.public_code,
                name=prop.name,
                complex_name=prop.complex_name,
                rooms=prop.rooms,
                max_guests=prop.max_guests,
                area_total=prop.area_total,
                photo=shown[0].url if shown else None,
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
    )
