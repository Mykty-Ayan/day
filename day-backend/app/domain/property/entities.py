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

    # Access. The guest asks for the Wi-Fi password more often than anything
    # else, so it lives on the unit rather than buried in the check-in text.
    wifi_name: str | None = None
    wifi_password: str | None = None

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
class PropertyCosts:
    """What a flat costs its subletter, split by whether a guest triggers it.

    The distinction is the whole point. Rent and utilities are paid whether
    anyone sleeps there or not, so they can never argue against selling a night
    cheaply — they argue about whether to keep the flat at all. Cleaning and
    consumables leave the account because a guest came, so they set the price
    below which an empty flat is strictly better.

    Analytics needs both; tonight's price needs only the second.
    """

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    property_id: uuid.UUID = field(default_factory=uuid.uuid4)
    #: Paid to the flat's owner every month.
    monthly_rent: Decimal = Decimal("0")
    #: Utilities, internet, building fees — everything that arrives monthly.
    monthly_utilities: Decimal = Decimal("0")
    #: Paid to the cleaner once per stay, not per night.
    cleaning_cost: Decimal = Decimal("0")
    #: Soap, water, coffee, laundry — what a night of occupancy uses up.
    consumables_per_night: Decimal = Decimal("0")
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def marginal_cost(self, nights: int = 1) -> Decimal:
        """What selling this stay costs us, cleaning included.

        The cleaner is paid once however long the guest stays, so a longer stay
        carries the same cleaning over more nights — which is exactly why long
        stays can be sold cheaper per night without losing money.
        """
        nights = max(nights, 1)
        return self.cleaning_cost + self.consumables_per_night * nights

    def fixed_cost(self, days: int) -> Decimal:
        """Rent and utilities for a stretch of calendar, occupied or not.

        Prorated by the average length of a month rather than by 30, so a year
        of periods adds up to a year of rent instead of twelve-and-a-bit.
        """
        if days <= 0:
            return Decimal("0")
        monthly = self.monthly_rent + self.monthly_utilities
        return (monthly * 12 * Decimal(days) / Decimal(365)).quantize(Decimal("0.01"))


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
