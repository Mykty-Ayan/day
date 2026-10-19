"""Property API endpoints."""

from __future__ import annotations

import asyncio
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.booking.manage_blocks import ManageBlocksService
from app.application.property.change_status import ChangePropertyStatusService
from app.application.property.create_property import (
    CreatePropertyInput,
    CreatePropertyService,
)
from app.application.property.day_prices import ManageDayPricesService
from app.application.property.get_property import GetPropertyService
from app.application.property.list_properties import ListPropertiesService
from app.application.property.manage_amenities import ManageAmenitiesService
from app.application.property.manage_facts import ManageFactsService
from app.application.property.manage_photos import ManagePhotosService
from app.application.property.manage_pricing import (
    ManagePricingService,
    PricingConfigInput,
)
from app.application.property.update_property import (
    UpdatePropertyInput,
    UpdatePropertyService,
)
from app.config import settings
from app.domain.auth.permissions import Permission
from app.domain.booking.exceptions import BlockFromCalendarError, BlockOverlapsBookingError
from app.domain.property.entities import DiscountRule, PropertyCosts, SeasonalPrice
from app.domain.property.value_objects import FactAudience, FactSource, PropertyStatus
from app.infrastructure.calendar_feeds import build_calendar_feeds
from app.infrastructure.calendar_fetch import fetch_calendar
from app.infrastructure.database import get_session
from app.infrastructure.repositories.booking import SqlBookingRepository
from app.infrastructure.repositories.property import (
    SqlAmenityRepository,
    SqlCompanyFactRepository,
    SqlDayPriceRepository,
    SqlDiscountRuleRepository,
    SqlPricingConfigRepository,
    SqlPropertyAuditLogRepository,
    SqlPropertyCostsRepository,
    SqlPropertyFactRepository,
    SqlPropertyPhotoRepository,
    SqlPropertyRepository,
    SqlSeasonalPriceRepository,
)
from app.infrastructure.security import calendar_token
from app.infrastructure.storage.s3 import signed_photo_url, upload_property_photo
from app.presentation.api.deps import Principal, get_company_id, get_principal, get_user_id, require
from app.presentation.schemas.booking import (
    CalendarFeedCreate,
    CalendarFeedResponse,
    PropertyBlockCreate,
    PropertyBlockResponse,
)
from app.presentation.schemas.property import (
    AmenityResponse,
    CompanyFactResponse,
    DayPriceResponse,
    DayPriceSet,
    DiscountRuleCreate,
    DiscountRuleResponse,
    PhotoCaption,
    PhotoCreate,
    PhotoReorder,
    PricingConfigCreate,
    PricingConfigResponse,
    PropertyAmenitiesSet,
    PropertyAuditLogResponse,
    PropertyCostsInput,
    PropertyCostsResponse,
    PropertyCreate,
    PropertyDetailResponse,
    PropertyFactCreate,
    PropertyFactResponse,
    PropertyListResponse,
    PropertyPhotoResponse,
    PropertyReadinessItem,
    PropertyReadinessResponse,
    PropertyResponse,
    PropertyStatusChange,
    PropertyUpdate,
    SeasonalPriceCreate,
    SeasonalPriceResponse,
    TagAssign,
    TagResponse,
)

router = APIRouter(prefix="/properties", tags=["properties"])
amenity_router = APIRouter(prefix="/amenities", tags=["amenities"])


# ---------- helpers ----------


def _repos(session: AsyncSession):
    return {
        "property": SqlPropertyRepository(session),
        "photo": SqlPropertyPhotoRepository(session),
        "amenity": SqlAmenityRepository(session),
        "pricing": SqlPricingConfigRepository(session),
        "seasonal": SqlSeasonalPriceRepository(session),
        "discount": SqlDiscountRuleRepository(session),
        "audit": SqlPropertyAuditLogRepository(session),
        "fact": SqlPropertyFactRepository(session),
        "company_fact": SqlCompanyFactRepository(session),
    }


def _sees_secrets(principal: Principal) -> bool:
    return Permission.PROPERTY_SECRETS_READ in principal.permissions


def _visible_facts(facts: list, *, sees_secrets: bool) -> list:
    if sees_secrets:
        return facts
    return [f for f in facts if f.audience != FactAudience.GUEST]


def _visible_photos(photos: list, *, sees_secrets: bool) -> list:
    if sees_secrets:
        return photos
    return [p for p in photos if p.audience != FactAudience.GUEST]


def _check_photo_audience(audience: FactAudience, principal: Principal) -> None:
    # Adding a check-in photo returns it; a writer who may not see codes may not place one.
    if audience == FactAudience.GUEST and not _sees_secrets(principal):
        raise HTTPException(status_code=403, detail="Check-in photos need property_secrets:read")


def _photo_response(photo) -> PropertyPhotoResponse:
    response = PropertyPhotoResponse.model_validate(photo, from_attributes=True)
    # Only callers who passed _visible_photos get here with a check-in photo.
    if photo.audience == FactAudience.GUEST:
        response.url = signed_photo_url(photo.url)
    return response


def _to_property_response(p, photos: list | None = None, *, sees_secrets: bool) -> PropertyResponse:
    return PropertyResponse(
        id=p.id,
        company_id=p.company_id,
        name=p.name,
        internal_name=p.internal_name,
        public_code=p.public_code,
        type=p.type,
        status=p.status,
        rental_mode=p.rental_mode,
        description=p.description,
        source_url=p.source_url,
        latitude=p.latitude,
        longitude=p.longitude,
        address_full=p.address_full,
        apartment_number=p.apartment_number,
        entrance=p.entrance,
        block=p.block,
        floor=p.floor,
        complex_name=p.complex_name,
        floors_total=p.floors_total,
        map_url=p.map_url,
        whatsapp_product_url=p.whatsapp_product_url,
        video_url=p.video_url,
        listing_urls=p.listing_urls,
        hourly_listing_urls=p.hourly_listing_urls,
        min_nights=p.min_nights,
        max_nights=p.max_nights,
        buffer_minutes=p.buffer_minutes,
        min_lead_hours=p.min_lead_hours,
        rooms=p.rooms,
        beds=p.beds,
        max_guests=p.max_guests,
        bathrooms=p.bathrooms,
        check_in_hour=p.check_in_hour,
        check_out_hour=p.check_out_hour,
        check_in_method=p.check_in_method,
        area_living=p.area_living,
        area_total=p.area_total,
        # How a guest gets in may hold a code: only for those who hand codes to guests.
        check_in_instructions=p.check_in_instructions if sees_secrets else None,
        check_out_instructions=p.check_out_instructions,
        house_rules=p.house_rules,
        wifi_name=p.wifi_name,
        wifi_password=p.wifi_password if sees_secrets else None,
        photos=[_photo_response(photo) for photo in _visible_photos(photos or [], sees_secrets=sees_secrets)],
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


# ---------- Property CRUD ----------


def _name_taken(e: IntegrityError, internal_name: str | None) -> HTTPException:
    """409 when the database refused a taken internal name; anything else goes up as it was.

    The services check the name first, but two requests can pass that check together.
    A clone picks its name itself, so it has none to quote.
    """
    if "uq_property_company_internal_name" not in str(e.orig):
        raise e
    if internal_name is None:
        return HTTPException(status_code=409, detail="Another flat took this internal name just now; try again")
    return HTTPException(status_code=409, detail=f"Property with internal name '{internal_name}' already exists")


@router.post(
    "",
    response_model=PropertyResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def create_property(
    body: PropertyCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
    principal: Principal = Depends(get_principal),
):
    repos = _repos(session)
    svc = CreatePropertyService(repos["property"], repos["audit"])
    try:
        result = await svc.execute(
            CreatePropertyInput(
                company_id=company_id,
                name=body.name,
                internal_name=body.internal_name,
                type=body.type,
                rental_mode=body.rental_mode,
                description=body.description,
                source_url=body.source_url,
                latitude=body.latitude,
                longitude=body.longitude,
                address_full=body.address_full,
                apartment_number=body.apartment_number,
                entrance=body.entrance,
                block=body.block,
                floor=body.floor,
                complex_name=body.complex_name,
                floors_total=body.floors_total,
                map_url=body.map_url,
                whatsapp_product_url=body.whatsapp_product_url,
                video_url=body.video_url,
                listing_urls=body.listing_urls,
                hourly_listing_urls=body.hourly_listing_urls,
                min_nights=body.min_nights,
                max_nights=body.max_nights,
                buffer_minutes=body.buffer_minutes,
                min_lead_hours=body.min_lead_hours,
                rooms=body.rooms,
                beds=body.beds,
                max_guests=body.max_guests,
                bathrooms=body.bathrooms,
                check_in_hour=body.check_in_hour,
                check_out_hour=body.check_out_hour,
                check_in_method=body.check_in_method,
                area_living=body.area_living,
                area_total=body.area_total,
                check_in_instructions=body.check_in_instructions,
                check_out_instructions=body.check_out_instructions,
                house_rules=body.house_rules,
                wifi_name=body.wifi_name,
                wifi_password=body.wifi_password,
                changed_by=user_id,
            )
        )
        await session.commit()
        return _to_property_response(result, sees_secrets=_sees_secrets(principal))
    except ValueError as e:
        await session.rollback()
        status_code = 409 if "already exists" in str(e).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(e))
    except IntegrityError as e:
        await session.rollback()
        raise _name_taken(e, body.internal_name)


@router.get("", response_model=PropertyListResponse, dependencies=[Depends(require(Permission.PROPERTIES_READ))])
async def list_properties(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    status: PropertyStatus | None = None,
    search: str | None = None,
    tag_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    repos = _repos(session)
    svc = ListPropertiesService(repos["property"])
    offset = (page - 1) * per_page
    result = await svc.execute(company_id, offset=offset, limit=per_page, status=status, search=search, tag_id=tag_id)
    photos_by_property = (
        await asyncio.gather(*[repos["photo"].list_by_property(prop.id) for prop in result.items])
        if result.items
        else []
    )
    pages = (result.total + per_page - 1) // per_page if result.total > 0 else 1
    return PropertyListResponse(
        items=[
            _to_property_response(prop, photos=photos, sees_secrets=_sees_secrets(principal))
            for prop, photos in zip(result.items, photos_by_property)
        ],
        total=result.total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


# What a flat's card says, for an integration to see what is missing before it answers guests.
# Only filled or empty: the values themselves (codes among them) stay behind their own permissions.
_READINESS_FIELDS = {
    "address": lambda p, x: bool(p.address_full),
    "map_url": lambda p, x: bool(p.map_url),
    "description": lambda p, x: bool(p.description),
    "max_guests": lambda p, x: p.max_guests is not None,
    "check_in_hour": lambda p, x: p.check_in_hour is not None,
    "check_out_hour": lambda p, x: p.check_out_hour is not None,
    "check_in_instructions": lambda p, x: bool(p.check_in_instructions),
    "check_out_instructions": lambda p, x: bool(p.check_out_instructions),
    "house_rules": lambda p, x: bool(p.house_rules),
    "wifi": lambda p, x: bool(p.wifi_name),
    "listing_urls": lambda p, x: bool(p.listing_urls or p.hourly_listing_urls),
    "photos": lambda p, x: x["photos"],
    "pricing": lambda p, x: x["pricing"],
    "facts": lambda p, x: x["facts"],
}


@router.get(
    "/readiness",
    response_model=PropertyReadinessResponse,
    dependencies=[Depends(require(Permission.PROPERTIES_READ))],
)
async def property_readiness(
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    """Which fields of each flat on sale are filled, and whether the company has rules for guests."""
    repos = _repos(session)
    flats = await repos["property"].list_by_company(company_id, limit=500)
    items = []
    # One query per flat and field kind; a company has a handful of flats.
    for prop in flats:
        if prop.status == PropertyStatus.ARCHIVED:
            continue
        extra = {
            "photos": bool(await repos["photo"].list_by_property(prop.id)),
            "pricing": await repos["pricing"].get_by_property(prop.id) is not None,
            "facts": bool(await repos["fact"].list_by_property(prop.id)),
        }
        filled = {name: check(prop, extra) for name, check in _READINESS_FIELDS.items()}
        items.append(
            PropertyReadinessItem(
                property_id=prop.id,
                name=prop.name,
                internal_name=prop.internal_name,
                status=prop.status,
                fields=filled,
                empty=[name for name, ok in filled.items() if not ok],
            )
        )
    return PropertyReadinessResponse(
        company_facts=bool(await repos["company_fact"].list_by_company(company_id)), items=items
    )


@router.get(
    "/{property_id}",
    response_model=PropertyDetailResponse,
    dependencies=[Depends(require(Permission.PROPERTIES_READ))],
)
async def get_property(
    property_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    repos = _repos(session)
    svc = GetPropertyService(
        repos["property"],
        repos["photo"],
        repos["amenity"],
        repos["pricing"],
        repos["seasonal"],
        repos["discount"],
        repos["audit"],
    )
    try:
        detail = await svc.execute(property_id, company_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Property not found")
    sees_secrets = _sees_secrets(principal)
    prop = _to_property_response(detail.property, photos=detail.photos, sees_secrets=sees_secrets)
    facts = _visible_facts(await repos["fact"].list_by_property(property_id), sees_secrets=sees_secrets)
    company_facts = _visible_facts(await repos["company_fact"].list_by_company(company_id), sees_secrets=sees_secrets)
    return PropertyDetailResponse(
        **prop.model_dump(),
        amenities=[AmenityResponse.model_validate(a, from_attributes=True) for a in detail.amenities],
        pricing=PricingConfigResponse.model_validate(detail.pricing, from_attributes=True) if detail.pricing else None,
        facts=[PropertyFactResponse.model_validate(f, from_attributes=True) for f in facts],
        company_facts=[CompanyFactResponse.model_validate(f, from_attributes=True) for f in company_facts],
    )


@router.get(
    "/{property_id}/calendar-link",
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def calendar_link(
    property_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    """The iCal link to paste into Airbnb and Booking.com, so they see bookings taken in Day."""
    prop = await _repos(session)["property"].get_by_id(property_id)
    if prop is None or prop.company_id != company_id:
        raise HTTPException(status_code=404, detail="Property not found")
    return {"url": _calendar_url(property_id)}


def _calendar_url(property_id: uuid.UUID) -> str:
    base = settings.PUBLIC_BASE_URL.rstrip("/")
    return f"{base}/api/v1/calendar/{property_id}.ics?token={calendar_token(property_id)}"


# ---------- Knowledge base ----------


@router.get(
    "/{property_id}/facts",
    response_model=list[PropertyFactResponse],
    dependencies=[Depends(require(Permission.PROPERTIES_READ))],
)
async def list_facts(
    property_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    repos = _repos(session)
    try:
        facts = await ManageFactsService(repos["property"], repos["fact"]).list(property_id, company_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    facts = _visible_facts(facts, sees_secrets=_sees_secrets(principal))
    return [PropertyFactResponse.model_validate(f, from_attributes=True) for f in facts]


@router.post(
    "/{property_id}/facts",
    response_model=PropertyFactResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.PROPERTY_FACTS_WRITE))],
)
async def add_fact(
    property_id: uuid.UUID,
    body: PropertyFactCreate,
    response: Response,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(get_principal),
):
    """Add a fact. The same text again answers 200 with the fact already kept."""
    repos = _repos(session)
    source = FactSource.API_KEY if principal.kind == "api_key" else FactSource.USER
    try:
        fact, created = await ManageFactsService(repos["property"], repos["fact"]).add(
            property_id, principal.company_id, body.text, body.audience, source=source
        )
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404 if str(e) == "Property not found" else 400, detail=str(e))
    await session.commit()
    if not created:
        response.status_code = 200
    return PropertyFactResponse.model_validate(fact, from_attributes=True)


@router.delete(
    "/{property_id}/facts/{fact_id}",
    status_code=204,
    dependencies=[Depends(require(Permission.PROPERTY_FACTS_WRITE))],
)
async def delete_fact(
    property_id: uuid.UUID,
    fact_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    try:
        await ManageFactsService(repos["property"], repos["fact"]).delete(property_id, company_id, fact_id)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(e))
    await session.commit()


@router.patch(
    "/{property_id}",
    response_model=PropertyResponse,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def update_property(
    property_id: uuid.UUID,
    body: PropertyUpdate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
    principal: Principal = Depends(get_principal),
):
    repos = _repos(session)
    svc = UpdatePropertyService(repos["property"], repos["audit"])

    # Build input, only setting fields that were explicitly provided
    provided = body.model_dump(exclude_unset=True)
    # A writer who cannot see how a guest gets in got it as null: what it sends back
    # is not an edit, and must not erase it.
    if not _sees_secrets(principal):
        provided.pop("check_in_instructions", None)
    inp = UpdatePropertyInput(property_id=property_id, company_id=company_id, changed_by=user_id)
    for field_name, value in provided.items():
        setattr(inp, field_name, value)

    try:
        result = await svc.execute(inp)
        await session.commit()
        return _to_property_response(result, sees_secrets=_sees_secrets(principal))
    except ValueError as e:
        await session.rollback()
        status_code = 409 if "already exists" in str(e).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(e))
    except IntegrityError as e:
        await session.rollback()
        raise _name_taken(e, provided.get("internal_name", ""))


@router.post(
    "/{property_id}/status",
    response_model=PropertyResponse,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def change_property_status(
    property_id: uuid.UUID,
    body: PropertyStatusChange,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
    principal: Principal = Depends(get_principal),
):
    repos = _repos(session)
    svc = ChangePropertyStatusService(repos["property"], repos["audit"])
    try:
        result = await svc.execute(property_id, company_id, body.target_status, changed_by=user_id)
        await session.commit()
        return _to_property_response(result, sees_secrets=_sees_secrets(principal))
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ---------- Clone ----------


@router.post(
    "/{property_id}/clone",
    response_model=PropertyResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def clone_property(
    property_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
    principal: Principal = Depends(get_principal),
):
    from app.application.property.clone_property import ClonePropertyService

    repos = _repos(session)
    svc = ClonePropertyService(
        repos["property"],
        repos["photo"],
        repos["amenity"],
        repos["pricing"],
        repos["seasonal"],
        repos["discount"],
        repos["audit"],
    )
    try:
        result = await svc.execute(property_id, company_id, changed_by=user_id)
        await session.commit()
        return _to_property_response(result, sees_secrets=_sees_secrets(principal))
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(e))
    except IntegrityError as e:
        await session.rollback()
        raise _name_taken(e, None)


# ---------- Photos ----------


@router.post(
    "/{property_id}/photos",
    response_model=PropertyPhotoResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def add_photo(
    property_id: uuid.UUID,
    body: PhotoCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    # A link cannot be made private after the fact: one in the public prefix
    # stays open to anyone, and one to a stored check-in photo of another
    # company would be signed and handed out. Check-in photos come as files.
    if body.audience == FactAudience.GUEST:
        raise HTTPException(status_code=400, detail="A check-in photo is uploaded as a file: POST /photos/upload")
    repos = _repos(session)
    svc = ManagePhotosService(repos["property"], repos["photo"])
    try:
        result = await svc.add_photo(
            property_id,
            company_id,
            body.url,
            sort_order=body.sort_order,
            is_cover=body.is_cover,
            caption=body.caption,
        )
        await session.commit()
        return _photo_response(result)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


def _sniff_photo(head: bytes) -> str | None:
    """The photo format the bytes actually hold. The declared Content-Type is
    the client's word; the file lands in a public bucket, so the bytes decide."""
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    # No HEIC: Chrome and Firefox cannot show it, and the listing page, OTAs
    # and guests open these files as they are. An iPhone sends JPEG when the
    # picker does not offer HEIC.
    return None


@router.post(
    "/{property_id}/photos/upload",
    response_model=PropertyPhotoResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def upload_photo(
    property_id: uuid.UUID,
    file: UploadFile = File(...),
    sort_order: int = Form(0),
    is_cover: bool = Form(False),
    audience: FactAudience = Form(FactAudience.PUBLIC),
    caption: str | None = Form(None, max_length=500),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    """A photo from the owner's phone or computer. Linking by URL (imports, the CRM) stays on POST /photos."""
    _check_photo_audience(audience, principal)
    if is_cover and audience == FactAudience.GUEST:
        raise HTTPException(status_code=400, detail="A check-in photo cannot be the cover")
    repos = _repos(session)
    prop = await repos["property"].get_by_id(property_id)
    if prop is None or prop.company_id != company_id:
        raise HTTPException(status_code=404, detail="Property not found")
    head = file.file.read(16)
    file.file.seek(0)
    content_type = _sniff_photo(head)
    if content_type is None:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG or WebP photos")
    size = file.size
    if size is None:
        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)
    if size > settings.S3_MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413, detail=f"Photo too large (max {settings.S3_MAX_UPLOAD_BYTES // (1024 * 1024)} MB)"
        )

    try:
        url = await upload_property_photo(
            property_id=property_id,
            file_obj=file.file,
            content_type=content_type,
            private=audience == FactAudience.GUEST,
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to upload photo")

    svc = ManagePhotosService(repos["property"], repos["photo"])
    result = await svc.add_photo(
        property_id, company_id, url, sort_order=sort_order, is_cover=is_cover, caption=caption, audience=audience
    )
    await session.commit()
    return _photo_response(result)


@router.patch(
    "/{property_id}/photos/{photo_id}",
    response_model=PropertyPhotoResponse,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def set_photo_caption(
    property_id: uuid.UUID,
    photo_id: uuid.UUID,
    body: PhotoCaption,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    repos = _repos(session)
    svc = ManagePhotosService(repos["property"], repos["photo"])
    try:
        photos = _visible_photos(await svc.list_photos(property_id, company_id), sees_secrets=_sees_secrets(principal))
        if not any(p.id == photo_id for p in photos):
            raise ValueError("Photo not found")
        result = await svc.set_caption(photo_id, property_id, company_id, body.caption)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(e))
    await session.commit()
    return _photo_response(result)


@router.delete(
    "/{property_id}/photos/{photo_id}",
    status_code=204,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def delete_photo(
    property_id: uuid.UUID,
    photo_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManagePhotosService(repos["property"], repos["photo"])
    try:
        await svc.delete_photo(photo_id, property_id, company_id)
        await session.commit()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.put(
    "/{property_id}/photos/reorder",
    response_model=list[PropertyPhotoResponse],
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def reorder_photos(
    property_id: uuid.UUID,
    body: PhotoReorder,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    repos = _repos(session)
    svc = ManagePhotosService(repos["property"], repos["photo"])
    try:
        result = await svc.reorder_photos(property_id, company_id, body.photo_ids)
        await session.commit()
        return [_photo_response(p) for p in _visible_photos(result, sees_secrets=_sees_secrets(principal))]
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ---------- Amenities ----------


@amenity_router.get(
    "",
    response_model=list[AmenityResponse],
    dependencies=[Depends(require(Permission.PROPERTIES_READ))],
)
async def list_amenities(session: AsyncSession = Depends(get_session)):
    repos = _repos(session)
    svc = ManageAmenitiesService(repos["amenity"], repos["property"])
    result = await svc.list_amenities()
    return [AmenityResponse.model_validate(a, from_attributes=True) for a in result]


@router.post(
    "/{property_id}/amenities",
    response_model=list[AmenityResponse],
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def set_property_amenities(
    property_id: uuid.UUID,
    body: PropertyAmenitiesSet,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManageAmenitiesService(repos["amenity"], repos["property"])
    try:
        result = await svc.set_property_amenities(property_id, company_id, body.amenity_ids)
        await session.commit()
        return [AmenityResponse.model_validate(a, from_attributes=True) for a in result]
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ---------- Costs ----------


async def _load_property_or_404(session, property_id: uuid.UUID, company_id: uuid.UUID):
    """Costs hang off a flat, and a flat belongs to exactly one company.

    Without this check a company could read and rewrite another company's
    rent by guessing a UUID: the costs table is keyed by property alone.
    """
    prop = await SqlPropertyRepository(session).get_by_id(property_id)
    if prop is None or prop.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
    return prop


@router.get(
    "/{property_id}/costs",
    response_model=PropertyCostsResponse | None,
    # Deliberately not PROPERTIES_READ. A cleaner holds that permission — they
    # have to see the flats they clean — and would then be able to read what
    # the subletter pays its owner. Costs are financial data, so they sit
    # behind the same permission as the analytics that report them.
    dependencies=[Depends(require(Permission.ANALYTICS_READ))],
)
async def get_costs(
    property_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    await _load_property_or_404(session, property_id, company_id)
    costs = await SqlPropertyCostsRepository(session).get_by_property(property_id)
    return PropertyCostsResponse.model_validate(costs, from_attributes=True) if costs else None


@router.put(
    "/{property_id}/costs",
    response_model=PropertyCostsResponse,
    # Writing costs moves every profit figure and every price floor, so it
    # needs both: the right to change the flat and the right to see its money.
    dependencies=[
        Depends(require(Permission.PROPERTIES_WRITE)),
        Depends(require(Permission.ANALYTICS_READ)),
    ],
)
async def upsert_costs(
    property_id: uuid.UUID,
    body: PropertyCostsInput,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    await _load_property_or_404(session, property_id, company_id)
    saved = await SqlPropertyCostsRepository(session).upsert(
        PropertyCosts(
            property_id=property_id,
            monthly_rent=body.monthly_rent,
            monthly_utilities=body.monthly_utilities,
            cleaning_cost=body.cleaning_cost,
            consumables_per_night=body.consumables_per_night,
        )
    )
    await session.commit()
    return PropertyCostsResponse.model_validate(saved, from_attributes=True)


# ---------- Pricing ----------


@router.put(
    "/{property_id}/pricing",
    response_model=PricingConfigResponse,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def upsert_pricing(
    property_id: uuid.UUID,
    body: PricingConfigCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManagePricingService(repos["property"], repos["pricing"], repos["seasonal"], repos["discount"])
    try:
        result = await svc.upsert_pricing(
            property_id,
            company_id,
            PricingConfigInput(
                base_price=body.base_price,
                hourly_price=body.hourly_price,
                weekend_markup=body.weekend_markup,
                default_deposit=body.default_deposit,
                hourly_deposit=body.hourly_deposit,
                extra_adult_price=body.extra_adult_price,
                extra_child_price=body.extra_child_price,
                base_guests=body.base_guests,
            ),
        )
        await session.commit()
        return PricingConfigResponse.model_validate(result, from_attributes=True)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/{property_id}/pricing",
    response_model=PricingConfigResponse | None,
    dependencies=[Depends(require(Permission.PROPERTIES_READ))],
)
async def get_pricing(
    property_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManagePricingService(repos["property"], repos["pricing"], repos["seasonal"], repos["discount"])
    try:
        return await svc.get_pricing(property_id, company_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Property not found")


# --- Seasonal ---


@router.post(
    "/{property_id}/pricing/seasonal",
    response_model=SeasonalPriceResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def add_seasonal_price(
    property_id: uuid.UUID,
    body: SeasonalPriceCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManagePricingService(repos["property"], repos["pricing"], repos["seasonal"], repos["discount"])
    try:
        result = await svc.add_seasonal_price(
            property_id,
            company_id,
            SeasonalPrice(
                name=body.name,
                start_date=body.start_date,
                end_date=body.end_date,
                price_per_night=body.price_per_night,
            ),
        )
        await session.commit()
        return SeasonalPriceResponse.model_validate(result, from_attributes=True)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete(
    "/{property_id}/pricing/seasonal/{season_id}",
    status_code=204,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def delete_seasonal_price(
    property_id: uuid.UUID,
    season_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManagePricingService(repos["property"], repos["pricing"], repos["seasonal"], repos["discount"])
    try:
        await svc.delete_seasonal_price(property_id, company_id, season_id)
        await session.commit()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/{property_id}/pricing/seasonal",
    response_model=list[SeasonalPriceResponse],
    dependencies=[Depends(require(Permission.PROPERTIES_READ))],
)
async def list_seasonal_prices(
    property_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManagePricingService(repos["property"], repos["pricing"], repos["seasonal"], repos["discount"])
    try:
        return [
            SeasonalPriceResponse.model_validate(s, from_attributes=True)
            for s in await svc.list_seasonal_prices(property_id, company_id)
        ]
    except ValueError:
        raise HTTPException(status_code=404, detail="Property not found")


# --- Discounts ---


@router.post(
    "/{property_id}/pricing/discounts",
    response_model=DiscountRuleResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def add_discount_rule(
    property_id: uuid.UUID,
    body: DiscountRuleCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManagePricingService(repos["property"], repos["pricing"], repos["seasonal"], repos["discount"])
    try:
        result = await svc.add_discount_rule(
            property_id,
            company_id,
            DiscountRule(
                min_nights=body.min_nights,
                discount_percent=body.discount_percent,
                discount_fixed=body.discount_fixed,
            ),
        )
        await session.commit()
        return DiscountRuleResponse.model_validate(result, from_attributes=True)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete(
    "/{property_id}/pricing/discounts/{discount_id}",
    status_code=204,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def delete_discount_rule(
    property_id: uuid.UUID,
    discount_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManagePricingService(repos["property"], repos["pricing"], repos["seasonal"], repos["discount"])
    try:
        await svc.delete_discount_rule(property_id, company_id, discount_id)
        await session.commit()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/{property_id}/pricing/discounts",
    response_model=list[DiscountRuleResponse],
    dependencies=[Depends(require(Permission.PROPERTIES_READ))],
)
async def list_discount_rules(
    property_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManagePricingService(repos["property"], repos["pricing"], repos["seasonal"], repos["discount"])
    try:
        return [
            DiscountRuleResponse.model_validate(d, from_attributes=True)
            for d in await svc.list_discount_rules(property_id, company_id)
        ]
    except ValueError:
        raise HTTPException(status_code=404, detail="Property not found")


# ---------- Audit log ----------


@router.get(
    "/{property_id}/audit-log",
    response_model=list[PropertyAuditLogResponse],
    dependencies=[Depends(require(Permission.PROPERTIES_READ))],
)
async def get_audit_log(
    property_id: uuid.UUID,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    repos = _repos(session)
    # Check property belongs to company
    prop = await repos["property"].get_by_id(property_id)
    if prop is None or prop.company_id != company_id:
        raise HTTPException(status_code=404, detail="Property not found")
    logs = await repos["audit"].list_by_property(property_id, offset=offset, limit=limit)
    entries = [PropertyAuditLogResponse.model_validate(entry, from_attributes=True) for entry in logs]
    if not _sees_secrets(principal):
        # The history of how a guest gets in may hold a code, older rows included.
        for entry in entries:
            if entry.field_name == "check_in_instructions":
                entry.old_value = "***" if entry.old_value else entry.old_value
                entry.new_value = "***" if entry.new_value else entry.new_value
    return entries


# ---------- Property Tags ----------


@router.post(
    "/{property_id}/tags",
    response_model=list[TagResponse],
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def assign_property_tag(
    property_id: uuid.UUID,
    body: TagAssign,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    from app.application.property.manage_tags import ManageTagsService as _MTS
    from app.infrastructure.repositories.property import SqlPropertyTagRepository as _SPTR

    tag_repo = _SPTR(session)
    repos = _repos(session)
    svc = _MTS(tag_repo, repos["property"])
    try:
        result = await svc.assign_tag(property_id, company_id, body.tag_id)
        await session.commit()
        return [TagResponse.model_validate(t, from_attributes=True) for t in result]
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete(
    "/{property_id}/tags/{tag_id}",
    status_code=204,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def remove_property_tag(
    property_id: uuid.UUID,
    tag_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    from app.application.property.manage_tags import ManageTagsService as _MTS
    from app.infrastructure.repositories.property import SqlPropertyTagRepository as _SPTR

    tag_repo = _SPTR(session)
    repos = _repos(session)
    svc = _MTS(tag_repo, repos["property"])
    try:
        await svc.remove_tag(property_id, company_id, tag_id)
        await session.commit()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/{property_id}/tags",
    response_model=list[TagResponse],
    dependencies=[Depends(require(Permission.PROPERTIES_READ))],
)
async def get_property_tags(
    property_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    from app.application.property.manage_tags import ManageTagsService as _MTS
    from app.infrastructure.repositories.property import SqlPropertyTagRepository as _SPTR

    tag_repo = _SPTR(session)
    repos = _repos(session)
    svc = _MTS(tag_repo, repos["property"])
    try:
        result = await svc.get_property_tags(property_id, company_id)
        return [TagResponse.model_validate(t, from_attributes=True) for t in result]
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------- Blocks: nights closed without a booking ----------


@router.get(
    "/{property_id}/blocks",
    response_model=list[PropertyBlockResponse],
    dependencies=[Depends(require(Permission.BOOKINGS_READ))],
)
async def list_blocks(
    property_id: uuid.UUID,
    date_from: date = Query(...),
    date_to: date = Query(...),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    svc = ManageBlocksService(SqlBookingRepository(session), SqlPropertyRepository(session))
    try:
        blocks = await svc.list(company_id, property_id, date_from, date_to)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return [PropertyBlockResponse.model_validate(b, from_attributes=True) for b in blocks]


@router.post(
    "/{property_id}/blocks",
    response_model=PropertyBlockResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.BOOKINGS_WRITE))],
)
async def create_block(
    property_id: uuid.UUID,
    body: PropertyBlockCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    """Close the flat's nights: no booking is made over them. A block over a booking is refused (409)."""
    svc = ManageBlocksService(SqlBookingRepository(session), SqlPropertyRepository(session))
    try:
        block = await svc.create(
            company_id,
            property_id,
            body.start_date,
            body.end_date,
            reason=body.reason,
            created_by=principal.actor_id,
        )
    except BlockOverlapsBookingError as e:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(e))
    await session.commit()
    return PropertyBlockResponse.model_validate(block, from_attributes=True)


@router.delete(
    "/{property_id}/blocks/{block_id}",
    status_code=204,
    dependencies=[Depends(require(Permission.BOOKINGS_WRITE))],
)
async def delete_block(
    property_id: uuid.UUID,
    block_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    svc = ManageBlocksService(SqlBookingRepository(session), SqlPropertyRepository(session))
    try:
        await svc.delete(company_id, property_id, block_id)
    except BlockFromCalendarError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    await session.commit()


# ---------- Calendar prices ----------


def _day_prices(session: AsyncSession) -> ManageDayPricesService:
    return ManageDayPricesService(SqlPropertyRepository(session), SqlDayPriceRepository(session))


def _day_price_answer(prices) -> list[DayPriceResponse]:
    return [DayPriceResponse(date=p.date, price=float(p.price)) for p in prices]


@router.get(
    "/{property_id}/day-prices",
    response_model=list[DayPriceResponse],
    dependencies=[Depends(require(Permission.PROPERTIES_READ))],
)
async def list_day_prices(
    property_id: uuid.UUID,
    date_from: date = Query(...),
    date_to: date = Query(...),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    """Nights priced on the calendar in [date_from, date_to)."""
    try:
        prices = await _day_prices(session).list(company_id, property_id, date_from, date_to)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _day_price_answer(prices)


@router.put(
    "/{property_id}/day-prices",
    response_model=list[DayPriceResponse],
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def set_day_prices(
    property_id: uuid.UUID,
    body: DayPriceSet,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    """Price the nights from start_date to the night before end_date, as Airbnb's custom
    nightly price: it replaces the usual price on them. Bookings made keep their price."""
    try:
        prices = await _day_prices(session).set(company_id, property_id, body.start_date, body.end_date, body.price)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404 if str(e) == "Property not found" else 422, detail=str(e))
    await session.commit()
    return _day_price_answer(prices)


@router.delete(
    "/{property_id}/day-prices",
    status_code=204,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def clear_day_prices(
    property_id: uuid.UUID,
    start_date: date = Query(...),
    end_date: date = Query(...),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    """Back to the usual price on those nights."""
    try:
        await _day_prices(session).clear(company_id, property_id, start_date, end_date)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404 if str(e) == "Property not found" else 422, detail=str(e))
    await session.commit()


# ---------- Platforms' calendars ----------
# The link holds the platform's secret: reading it takes properties:write, as the
# Day calendar link does.


def _feed_answer(feed) -> CalendarFeedResponse:
    answer = CalendarFeedResponse.model_validate(feed, from_attributes=True)
    answer.export_url = f"{_calendar_url(feed.property_id)}&exclude={feed.id}"
    return answer


@router.get(
    "/{property_id}/calendar-feeds",
    response_model=list[CalendarFeedResponse],
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def list_calendar_feeds(
    property_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    try:
        feeds = await build_calendar_feeds(session, fetch_calendar).list(company_id, property_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return [_feed_answer(f) for f in feeds]


@router.post(
    "/{property_id}/calendar-feeds",
    response_model=CalendarFeedResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def add_calendar_feed(
    property_id: uuid.UUID,
    body: CalendarFeedCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    """Add a platform's calendar of the flat and read it at once: its events close the
    nights. A read that fails is answered in last_error, and the calendar stays."""
    feeds = build_calendar_feeds(session, fetch_calendar)
    try:
        feed = await feeds.add(company_id, property_id, body.name, body.url)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="This calendar is already added")
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(e))
    await session.commit()
    return await _read_now(session, feeds, feed)


async def _read_now(session: AsyncSession, feeds, feed) -> CalendarFeedResponse:
    # Read with no transaction open: a platform that answers slowly holds no
    # database connection (the session gives it back at commit).
    loaded = await feeds.load(feed)
    await feeds.apply(feed, loaded)
    await session.commit()
    return _feed_answer(await feeds.get(feed.id))


@router.post(
    "/{property_id}/calendar-feeds/{feed_id}/sync",
    response_model=CalendarFeedResponse,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def sync_calendar_feed(
    property_id: uuid.UUID,
    feed_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    """Read the calendar now, not at the next turn of the timer."""
    feeds = build_calendar_feeds(session, fetch_calendar)
    try:
        feed = await feeds.get_own(company_id, property_id, feed_id)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(e))
    await session.commit()
    return await _read_now(session, feeds, feed)


@router.delete(
    "/{property_id}/calendar-feeds/{feed_id}",
    status_code=204,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def remove_calendar_feed(
    property_id: uuid.UUID,
    feed_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    """The calendar goes with the nights it closed."""
    try:
        await build_calendar_feeds(session, fetch_calendar).remove(company_id, property_id, feed_id)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(e))
    await session.commit()
