"""Property API endpoints."""

from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.property.change_status import ChangePropertyStatusService
from app.application.property.create_property import (
    CreatePropertyInput,
    CreatePropertyService,
)
from app.application.property.get_property import GetPropertyService
from app.application.property.list_properties import ListPropertiesService
from app.application.property.manage_amenities import ManageAmenitiesService
from app.application.property.manage_photos import ManagePhotosService
from app.application.property.manage_pricing import (
    ManagePricingService,
    PricingConfigInput,
)
from app.application.property.update_property import (
    UpdatePropertyInput,
    UpdatePropertyService,
)
from app.domain.auth.permissions import Permission
from app.domain.property.entities import DiscountRule, SeasonalPrice
from app.domain.property.value_objects import PropertyStatus
from app.infrastructure.database import get_session
from app.infrastructure.repositories.property import (
    SqlAmenityRepository,
    SqlDiscountRuleRepository,
    SqlPricingConfigRepository,
    SqlPropertyAuditLogRepository,
    SqlPropertyPhotoRepository,
    SqlPropertyRepository,
    SqlSeasonalPriceRepository,
)
from app.presentation.api.deps import get_company_id, get_user_id, require
from app.presentation.schemas.property import (
    AmenityCreate,
    AmenityResponse,
    DiscountRuleCreate,
    DiscountRuleResponse,
    PhotoCreate,
    PhotoReorder,
    PricingConfigCreate,
    PricingConfigResponse,
    PropertyAmenitiesSet,
    PropertyAuditLogResponse,
    PropertyCreate,
    PropertyDetailResponse,
    PropertyListResponse,
    PropertyPhotoResponse,
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
    }


def _to_property_response(p, photos: list | None = None) -> PropertyResponse:
    return PropertyResponse(
        id=p.id,
        company_id=p.company_id,
        name=p.name,
        internal_name=p.internal_name,
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
        rooms=p.rooms,
        beds=p.beds,
        area_living=p.area_living,
        area_total=p.area_total,
        check_in_instructions=p.check_in_instructions,
        check_out_instructions=p.check_out_instructions,
        house_rules=p.house_rules,
        wifi_name=p.wifi_name,
        wifi_password=p.wifi_password,
        photos=[PropertyPhotoResponse.model_validate(photo, from_attributes=True) for photo in (photos or [])],
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


# ---------- Property CRUD ----------


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
                rooms=body.rooms,
                beds=body.beds,
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
        return _to_property_response(result)
    except ValueError as e:
        await session.rollback()
        status_code = 409 if "already exists" in str(e).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(e))


@router.get("", response_model=PropertyListResponse, dependencies=[Depends(require(Permission.PROPERTIES_READ))])
async def list_properties(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    status: PropertyStatus | None = None,
    search: str | None = None,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ListPropertiesService(repos["property"])
    offset = (page - 1) * per_page
    result = await svc.execute(company_id, offset=offset, limit=per_page, status=status, search=search)
    photos_by_property = (
        await asyncio.gather(*[repos["photo"].list_by_property(prop.id) for prop in result.items])
        if result.items
        else []
    )
    pages = (result.total + per_page - 1) // per_page if result.total > 0 else 1
    return PropertyListResponse(
        items=[_to_property_response(prop, photos=photos) for prop, photos in zip(result.items, photos_by_property)],
        total=result.total,
        page=page,
        per_page=per_page,
        pages=pages,
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
    prop = _to_property_response(detail.property, photos=detail.photos)
    return PropertyDetailResponse(
        **prop.model_dump(),
        amenities=[AmenityResponse.model_validate(a, from_attributes=True) for a in detail.amenities],
        pricing=PricingConfigResponse.model_validate(detail.pricing, from_attributes=True) if detail.pricing else None,
    )


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
):
    repos = _repos(session)
    svc = UpdatePropertyService(repos["property"], repos["audit"])

    # Build input, only setting fields that were explicitly provided
    provided = body.model_dump(exclude_unset=True)
    inp = UpdatePropertyInput(property_id=property_id, company_id=company_id, changed_by=user_id)
    for field_name, value in provided.items():
        setattr(inp, field_name, value)

    try:
        result = await svc.execute(inp)
        await session.commit()
        return _to_property_response(result)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


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
):
    repos = _repos(session)
    svc = ChangePropertyStatusService(repos["property"], repos["audit"])
    try:
        result = await svc.execute(property_id, company_id, body.target_status, changed_by=user_id)
        await session.commit()
        return _to_property_response(result)
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
        return _to_property_response(result)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(e))


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
    repos = _repos(session)
    svc = ManagePhotosService(repos["property"], repos["photo"])
    try:
        result = await svc.add_photo(
            property_id,
            company_id,
            body.url,
            sort_order=body.sort_order,
            is_cover=body.is_cover,
        )
        await session.commit()
        return PropertyPhotoResponse.model_validate(result, from_attributes=True)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


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
):
    repos = _repos(session)
    svc = ManagePhotosService(repos["property"], repos["photo"])
    try:
        result = await svc.reorder_photos(property_id, company_id, body.photo_ids)
        await session.commit()
        return [PropertyPhotoResponse.model_validate(p, from_attributes=True) for p in result]
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


@amenity_router.post(
    "",
    response_model=AmenityResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.PROPERTIES_WRITE))],
)
async def create_amenity(
    body: AmenityCreate,
    session: AsyncSession = Depends(get_session),
):
    repos = _repos(session)
    svc = ManageAmenitiesService(repos["amenity"], repos["property"])
    result = await svc.create_amenity(body.name, body.category, body.icon)
    await session.commit()
    return AmenityResponse.model_validate(result, from_attributes=True)


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
):
    repos = _repos(session)
    # Check property belongs to company
    prop = await repos["property"].get_by_id(property_id)
    if prop is None or prop.company_id != company_id:
        raise HTTPException(status_code=404, detail="Property not found")
    logs = await repos["audit"].list_by_property(property_id, offset=offset, limit=limit)
    return [PropertyAuditLogResponse.model_validate(entry, from_attributes=True) for entry in logs]


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
