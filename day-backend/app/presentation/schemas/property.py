from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, computed_field, model_validator

from app.domain.booking.value_objects import RentalMode
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
    rental_mode: RentalMode = RentalMode.DAILY
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
    wifi_name: str | None = Field(default=None, max_length=255)
    wifi_password: str | None = Field(default=None, max_length=255)


class PropertyUpdate(BaseModel):
    name: str | None = None
    internal_name: str | None = None
    type: PropertyType | None = None
    rental_mode: RentalMode | None = None
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
    wifi_name: str | None = Field(default=None, max_length=255)
    wifi_password: str | None = Field(default=None, max_length=255)


class PropertyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    internal_name: str
    type: PropertyType
    status: PropertyStatus
    rental_mode: RentalMode = RentalMode.DAILY
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
    wifi_name: str | None = None
    wifi_password: str | None = None
    photos: list["PropertyPhotoResponse"] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PropertyStatusChange(BaseModel):
    # Accept both `target_status` (current) and `status` (legacy tests/clients)
    target_status: PropertyStatus = Field(validation_alias=AliasChoices("target_status", "status"))


class PropertyListResponse(BaseModel):
    items: list[PropertyResponse]
    total: int
    page: int
    per_page: int
    pages: int


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
    hourly_price: Decimal = Field(default=Decimal("0"), ge=0)
    weekend_markup: Decimal = Field(default=Decimal("0"), ge=0)
    default_deposit: Decimal = Field(default=Decimal("0"), ge=0)
    extra_adult_price: Decimal = Field(default=Decimal("0"), ge=0)
    extra_child_price: Decimal = Field(default=Decimal("0"), ge=0)
    base_guests: int = Field(default=1, ge=1)


class PricingConfigResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={Decimal: float},
    )

    id: uuid.UUID
    property_id: uuid.UUID
    base_price: Decimal
    hourly_price: Decimal
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
    # Accept both `price_per_night` (current) and `price` (legacy tests/clients)
    price_per_night: Decimal = Field(
        ...,
        ge=0,
        validation_alias=AliasChoices("price_per_night", "price"),
    )


class SeasonalPriceResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={Decimal: float},
    )

    id: uuid.UUID
    pricing_config_id: uuid.UUID
    name: str
    start_date: date
    end_date: date
    price_per_night: Decimal
    created_at: datetime | None = None

    @computed_field
    @property
    def price(self) -> Decimal:
        # Backward-compatible mirror for clients expecting `price`.
        return self.price_per_night


class DiscountRuleCreate(BaseModel):
    min_nights: int = Field(..., ge=1)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_fixed: Decimal = Field(default=Decimal("0"), ge=0)

    @model_validator(mode="before")
    @classmethod
    def _accept_legacy_shape(cls, data):
        # Backward-compatible input: { type: 'percent'|'fixed', value: number }
        if not isinstance(data, dict):
            return data

        rule_type = data.get("type")
        value = data.get("value")
        if rule_type is None or value is None:
            return data

        if rule_type == "percent":
            data.setdefault("discount_percent", value)
            data.setdefault("discount_fixed", 0)
        elif rule_type == "fixed":
            data.setdefault("discount_fixed", value)
            data.setdefault("discount_percent", 0)
        return data


class DiscountRuleResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={Decimal: float},
    )

    id: uuid.UUID
    pricing_config_id: uuid.UUID
    min_nights: int
    discount_percent: Decimal
    discount_fixed: Decimal
    created_at: datetime | None = None

    @computed_field
    @property
    def type(self) -> str:
        return "percent" if self.discount_percent > 0 else "fixed"

    @computed_field
    @property
    def value(self) -> Decimal:
        return self.discount_percent if self.discount_percent > 0 else self.discount_fixed


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


class PropertyDetailResponse(PropertyResponse):
    photos: list[PropertyPhotoResponse] = []
    amenities: list[AmenityResponse] = []
    pricing: PricingConfigResponse | None = None


# ---------- Tags ----------


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    color: str = Field(default="#3B82F6", max_length=20)


class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    color: str
    created_at: datetime | None = None


class TagAssign(BaseModel):
    tag_id: uuid.UUID


class BatchPricingUpdate(BaseModel):
    base_price: Decimal = Field(..., ge=0)
