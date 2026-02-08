from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.property.value_objects import (
    AmenityCategory,
    AuditAction,
    PropertyStatus,
    PropertyType,
)

# ---------- Property ----------


class PropertyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    internal_name: str = Field(..., min_length=1, max_length=255)
    type: PropertyType
    description: str | None = None
    source_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    address_full: str | None = None
    apartment_number: str | None = None
    entrance: str | None = None
    block: str | None = None
    floor: int | None = None
    rooms: int | None = None
    beds: int | None = None
    area_living: float | None = None
    area_total: float | None = None
    check_in_instructions: str | None = None
    check_out_instructions: str | None = None
    house_rules: str | None = None


class PropertyUpdate(BaseModel):
    name: str | None = None
    internal_name: str | None = None
    type: PropertyType | None = None
    description: str | None = None
    source_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    address_full: str | None = None
    apartment_number: str | None = None
    entrance: str | None = None
    block: str | None = None
    floor: int | None = None
    rooms: int | None = None
    beds: int | None = None
    area_living: float | None = None
    area_total: float | None = None
    check_in_instructions: str | None = None
    check_out_instructions: str | None = None
    house_rules: str | None = None


class PropertyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    internal_name: str
    type: PropertyType
    status: PropertyStatus
    description: str | None = None
    source_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    address_full: str | None = None
    apartment_number: str | None = None
    entrance: str | None = None
    block: str | None = None
    floor: int | None = None
    rooms: int | None = None
    beds: int | None = None
    area_living: float | None = None
    area_total: float | None = None
    check_in_instructions: str | None = None
    check_out_instructions: str | None = None
    house_rules: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PropertyStatusChange(BaseModel):
    target_status: PropertyStatus


class PropertyListResponse(BaseModel):
    items: list[PropertyResponse]
    total: int
    offset: int
    limit: int


# ---------- Photos ----------


class PropertyPhotoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    property_id: uuid.UUID
    url: str
    sort_order: int
    is_cover: bool
    created_at: datetime | None = None


class PhotoCreate(BaseModel):
    url: str = Field(..., min_length=1, max_length=1024)
    sort_order: int = 0
    is_cover: bool = False


class PhotoReorder(BaseModel):
    photo_ids: list[uuid.UUID]


# ---------- Amenity ----------


class AmenityCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    icon: str | None = None
    category: AmenityCategory


class AmenityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    icon: str | None = None
    category: AmenityCategory


class PropertyAmenitiesSet(BaseModel):
    amenity_ids: list[uuid.UUID]


# ---------- Pricing ----------


class PricingConfigCreate(BaseModel):
    base_price: Decimal = Field(..., ge=0)
    weekend_markup: Decimal = Field(default=Decimal("0"), ge=0)
    default_deposit: Decimal = Field(default=Decimal("0"), ge=0)
    extra_adult_price: Decimal = Field(default=Decimal("0"), ge=0)
    extra_child_price: Decimal = Field(default=Decimal("0"), ge=0)
    base_guests: int = Field(default=1, ge=1)


class PricingConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    property_id: uuid.UUID
    base_price: Decimal
    weekend_markup: Decimal
    default_deposit: Decimal
    extra_adult_price: Decimal
    extra_child_price: Decimal
    base_guests: int
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SeasonalPriceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    start_date: date
    end_date: date
    price_per_night: Decimal = Field(..., ge=0)


class SeasonalPriceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pricing_config_id: uuid.UUID
    name: str
    start_date: date
    end_date: date
    price_per_night: Decimal
    created_at: datetime | None = None


class DiscountRuleCreate(BaseModel):
    min_nights: int = Field(..., ge=1)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_fixed: Decimal = Field(default=Decimal("0"), ge=0)


class DiscountRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pricing_config_id: uuid.UUID
    min_nights: int
    discount_percent: Decimal
    discount_fixed: Decimal
    created_at: datetime | None = None


# ---------- Audit ----------


class PropertyAuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    property_id: uuid.UUID
    changed_by: uuid.UUID | None = None
    field_name: str
    old_value: str | None = None
    new_value: str | None = None
    action: AuditAction
    created_at: datetime | None = None


# ---------- Full detail ----------


class PropertyDetailResponse(BaseModel):
    property: PropertyResponse
    photos: list[PropertyPhotoResponse]
    amenities: list[AmenityResponse]
    pricing: PricingConfigResponse | None = None
    seasonal_prices: list[SeasonalPriceResponse]
    discount_rules: list[DiscountRuleResponse]
    audit_logs: list[PropertyAuditLogResponse]
