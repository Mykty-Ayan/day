from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal

from app.domain.booking.value_objects import RentalMode
from app.domain.property.value_objects import (
    AmenityCategory,
    AuditAction,
    PropertyStatus,
    PropertyType,
)


@dataclass
class Property:
    """Aggregate root for the Property domain."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = ""
    internal_name: str = ""
    type: PropertyType = PropertyType.APARTMENT
    status: PropertyStatus = PropertyStatus.NEW
    rental_mode: RentalMode = RentalMode.DAILY
    description: str | None = None
    source_url: str | None = None

    # Location
    latitude: float | None = None
    longitude: float | None = None
    address_full: str | None = None
    apartment_number: str | None = None
    entrance: str | None = None
    block: str | None = None
    floor: int | None = None

    # Details
    rooms: int | None = None
    beds: int | None = None
    area_living: float | None = None
    area_total: float | None = None

    # Rules
    check_in_instructions: str | None = None
    check_out_instructions: str | None = None
    house_rules: str | None = None

    created_at: datetime | None = None
    updated_at: datetime | None = None

    def change_status(self, new_status: PropertyStatus) -> None:
        if not self.status.can_transition_to(new_status):
            raise ValueError(f"Cannot transition from {self.status.value} to {new_status.value}")
        self.status = new_status


@dataclass
class PropertyPhoto:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    property_id: uuid.UUID = field(default_factory=uuid.uuid4)
    url: str = ""
    sort_order: int = 0
    is_cover: bool = False
    created_at: datetime | None = None


@dataclass
class Amenity:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = ""
    icon: str | None = None
    category: AmenityCategory = AmenityCategory.OTHER


@dataclass
class PricingConfig:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    property_id: uuid.UUID = field(default_factory=uuid.uuid4)
    base_price: Decimal = Decimal("0")
    hourly_price: Decimal = Decimal("0")
    weekend_markup: Decimal = Decimal("0")
    default_deposit: Decimal = Decimal("0")
    extra_adult_price: Decimal = Decimal("0")
    extra_child_price: Decimal = Decimal("0")
    base_guests: int = 1
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass
class SeasonalPrice:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    pricing_config_id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = ""
    start_date: date | None = None
    end_date: date | None = None
    price_per_night: Decimal = Decimal("0")
    created_at: datetime | None = None


@dataclass
class DiscountRule:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    pricing_config_id: uuid.UUID = field(default_factory=uuid.uuid4)
    min_nights: int = 1
    discount_percent: Decimal = Decimal("0")
    discount_fixed: Decimal = Decimal("0")
    created_at: datetime | None = None


@dataclass
class PropertyTag:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = ""
    color: str = "#3B82F6"
    created_at: datetime | None = None


@dataclass
class PropertyAuditLog:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    property_id: uuid.UUID = field(default_factory=uuid.uuid4)
    changed_by: uuid.UUID | None = None
    field_name: str = ""
    old_value: str | None = None
    new_value: str | None = None
    action: AuditAction = AuditAction.CREATE
    created_at: datetime | None = None
