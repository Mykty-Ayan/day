from __future__ import annotations

import re
import secrets
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import Decimal

from app.domain.booking.value_objects import RentalMode
from app.domain.property.value_objects import (
    AmenityCategory,
    AuditAction,
    CheckInMethod,
    FactAudience,
    FactSource,
    PropertyStatus,
    PropertyType,
)

# Lower case letters and digits a reader cannot mix up (no 0/o, 1/l/i).
_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def new_public_code() -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(7))


# A WhatsApp Business catalogue product link: https://wa.me/p/<product id>/<phone>.
_WA_PRODUCT = re.compile(r"^https?://(?:www\.)?wa\.me/p/(\d{10,18})(?:[/?#]|$)", re.IGNORECASE)


def whatsapp_product_id(url: str | None) -> str | None:
    """The catalogue product's id in its link, which Whapi sends by; None for any other link."""
    found = _WA_PRODUCT.match(url or "")
    return found.group(1) if found else None


@dataclass
class Property:
    """Aggregate root for the Property domain."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = ""
    internal_name: str = ""
    # The flat's code on its page for guests (/s/<code>): random, so the link tells
    # nothing of the flat — the internal name often holds its number.
    public_code: str = field(default_factory=lambda: new_public_code())
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
    # Guests look a flat up by its residential complex; "5 of 9" needs the floors.
    complex_name: str | None = None
    floors_total: int | None = None

    # Links the CRM hands to guests: the map pin, the product in the WhatsApp
    # Business catalog, a video tour.
    map_url: str | None = None
    whatsapp_product_url: str | None = None
    video_url: str | None = None
    # The flat's listings on Krisha, Booking, Airbnb, OLX: a guest sends one,
    # and the CRM finds the flat by it.
    listing_urls: list[str] = field(default_factory=list)
    # The same, for the flat's listings to rent by the hour: the link the guest
    # sends tells the CRM which stay they mean.
    hourly_listing_urls: list[str] = field(default_factory=list)

    # Stay rules for bookings made in Day; empty is no rule. The fewest and most
    # nights of a daily stay; hours kept free around an hourly booking for
    # cleaning; hours a stay must be booked ahead of its check-in.
    min_nights: int | None = None
    max_nights: int | None = None
    buffer_minutes: int | None = None
    min_lead_hours: int | None = None

    # Details
    rooms: int | None = None
    beds: int | None = None
    # How many may stay (OTAs need it; beds alone is not the answer) and how
    # many bathrooms there are.
    max_guests: int | None = None
    bathrooms: int | None = None
    # The flat's own hours; empty means the company default (14:00 / 12:00).
    check_in_hour: int | None = None
    check_out_hour: int | None = None
    check_in_method: CheckInMethod | None = None
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
    # What the picture shows ("entrance from the yard"), for whoever sends it on.
    caption: str | None = None
    # guest: a check-in instruction (the entrance, the lock): never in the
    # listing, only for those who hand codes to guests.
    audience: FactAudience = FactAudience.PUBLIC
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
    # The deposit of a stay by the hour; 0 is "not set", never the nightly one.
    hourly_deposit: Decimal = Decimal("0")
    extra_adult_price: Decimal = Decimal("0")
    extra_child_price: Decimal = Decimal("0")
    base_guests: int = 1
    # Hourly tariffs: one price for Sunday to Thursday, one for Friday and Saturday.
    # 0 switches a tariff off; a weekend price of 0 is the weekday one.
    price_3h: Decimal = Decimal("0")
    price_3h_weekend: Decimal = Decimal("0")
    price_6h: Decimal = Decimal("0")
    price_6h_weekend: Decimal = Decimal("0")
    price_night: Decimal = Decimal("0")
    price_night_weekend: Decimal = Decimal("0")
    # Late hours: a stay out after late_from is no longer sold by the hour. It is the
    # night when out by night_to the next morning and no longer than night_max_hours,
    # else whole days.
    late_from: time = time(23)
    night_to: time = time(10)
    night_max_hours: int = 12
    created_at: datetime | None = None
    updated_at: datetime | None = None


#: The tariff fields of a pricing config, copied as one by storage, the API and clones.
TARIFF_PRICES = ("price_3h", "price_3h_weekend", "price_6h", "price_6h_weekend", "price_night", "price_night_weekend")
TARIFF_FIELDS = (*TARIFF_PRICES, "late_from", "night_to", "night_max_hours")


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
class DayPrice:
    """A price for one night set on the calendar, as Airbnb's custom nightly price:
    it replaces the flat's price for that night (base, season and weekend markup),
    and a long-stay discount does not cut it."""

    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    property_id: uuid.UUID = field(default_factory=uuid.uuid4)
    date: date = field(default_factory=date.today)
    price: Decimal = Decimal("0")


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


@dataclass
class PropertyFact:
    """One note in an apartment's knowledge base."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    property_id: uuid.UUID = field(default_factory=uuid.uuid4)
    text: str = ""
    audience: FactAudience = FactAudience.GUEST
    source: FactSource = FactSource.USER
    created_at: datetime | None = None


@dataclass
class CompanyFact:
    """A rule for every flat of the company: documents, pets, smoking, quiet hours."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    text: str = ""
    audience: FactAudience = FactAudience.PUBLIC
    source: FactSource = FactSource.USER
    created_at: datetime | None = None
