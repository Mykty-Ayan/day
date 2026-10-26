"""What a flat's page for guests shows. Every field is named here on purpose: a new
field on the flat stays private until it is added to this list."""

from __future__ import annotations

import math
from datetime import date, datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.application.booking.guest_hold import OfferBooking
from app.application.booking.guest_offers import PublicOffer, greeting, mask_phone
from app.application.property.public_stay import PublicStay
from app.config import settings
from app.domain.booking.value_objects import RentalMode
from app.presentation.schemas.offers import full_phone


class PublicAmenity(BaseModel):
    name: str
    category: str


def _set(amount) -> float | None:
    """A deposit the host filled in; 0 is "not set"."""
    return float(amount) if amount > 0 else None


class PublicPrices(BaseModel):
    night: float | None = None
    hour: float | None = None
    # The deposit of a stay by the night and by the hour, each only where the flat takes it.
    deposit: float | None = None
    hour_deposit: float | None = None


class PublicNightResponse(BaseModel):
    date: date
    price: float
    free: bool


class PublicStayCompany(BaseModel):
    """The company behind the flat, when it has set up its site: the page links to it."""

    slug: str
    title: str
    logo_url: str | None = None
    accent_color: str | None = None
    # Digits for wa.me: the guest asks about the flat before booking.
    whatsapp: str | None = None


class PublicStayResponse(BaseModel):
    code: str
    name: str
    description: str | None = None
    type: str
    rental_mode: str
    rooms: int | None = None
    beds: int | None = None
    bathrooms: int | None = None
    max_guests: int | None = None
    area_total: float | None = None
    floor: int | None = None
    floors_total: int | None = None
    complex_name: str | None = None
    check_in_hour: int | None = None
    check_out_hour: int | None = None
    check_in_method: str | None = None
    house_rules: str | None = None
    min_nights: int | None = None
    # No map link and no video: the map pins the building (as Airbnb, the place is
    # told after booking), and an owner's video may be the one of the lock.
    photos: list[str] = []
    amenities: list[PublicAmenity] = []
    prices: PublicPrices
    nights: list[PublicNightResponse] = []
    company: PublicStayCompany | None = None

    @classmethod
    def from_stay(cls, stay: PublicStay) -> PublicStayResponse:
        p, pricing = stay.property, stay.pricing
        return cls(
            code=p.public_code,
            name=p.name,
            description=p.description,
            type=p.type.value,
            rental_mode=p.rental_mode.value,
            rooms=p.rooms,
            beds=p.beds,
            bathrooms=p.bathrooms,
            max_guests=p.max_guests,
            area_total=p.area_total,
            floor=p.floor,
            floors_total=p.floors_total,
            complex_name=p.complex_name,
            # A flat with no hours of its own keeps the company's, as a booking does.
            check_in_hour=settings.DEFAULT_CHECK_IN_HOUR if p.check_in_hour is None else p.check_in_hour,
            check_out_hour=settings.DEFAULT_CHECK_OUT_HOUR if p.check_out_hour is None else p.check_out_hour,
            check_in_method=p.check_in_method.value if p.check_in_method else None,
            house_rules=p.house_rules,
            min_nights=p.min_nights,
            photos=stay.photos,
            amenities=[PublicAmenity(name=a.name, category=a.category.value) for a in stay.amenities],
            # Only the prices the flat takes: no night for one let by the hour, no hour
            # for one let by the night.
            prices=PublicPrices(
                night=float(pricing.base_price) if stay.by_night and pricing else None,
                hour=float(pricing.hourly_price) if stay.by_hour and pricing else None,
                # By the kind of stay the flat takes, not by its price: a flat priced by its
                # calendar alone still takes the nightly deposit when booked by a link.
                deposit=_set(pricing.default_deposit) if pricing and p.rental_mode != RentalMode.HOURLY else None,
                hour_deposit=_set(pricing.hourly_deposit) if pricing and p.rental_mode != RentalMode.DAILY else None,
            ),
            nights=[PublicNightResponse(date=n.date, price=float(n.price), free=n.free) for n in stay.nights],
        )


class PublicOfferFlat(BaseModel):
    code: str
    name: str
    complex_name: str | None = None
    rooms: int | None = None
    max_guests: int | None = None
    area_total: float | None = None
    floor: int | None = None
    photo: str | None = None
    # The stay's price for the offer's dates and guests, as a booking would count it.
    total: float | None = None
    free: bool


class PublicOfferBook(BaseModel):
    """A guest books one flat of the link. Name and phone only when they are not the
    link's: it was forwarded, or someone else pays."""

    flat: str = Field(min_length=1, max_length=16)
    guests: int = Field(ge=1, le=50)
    name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)

    @field_validator("phone")
    @classmethod
    def _a_phone_number(cls, value: str | None) -> str | None:
        return full_phone(value) if value else None


class PublicStayBook(BaseModel):
    """A guest books the flat from its own page: by the night (check_in, check_out) or
    by the hour (starts_at, ends_at, the company's local time without a zone)."""

    rental_mode: Literal["daily", "hourly"] = "daily"
    check_in: date | None = None
    check_out: date | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    guests: int = Field(ge=1, le=50)
    name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=5, max_length=50)

    @field_validator("phone")
    @classmethod
    def _a_phone_number(cls, value: str) -> str:
        return full_phone(value)

    @model_validator(mode="after")
    def _the_stay_of_its_kind(self):
        if self.rental_mode == "hourly":
            if self.check_in is not None or self.check_out is not None:
                raise ValueError("An hourly stay takes starts_at and ends_at")
            if self.starts_at is None or self.ends_at is None:
                raise ValueError("An hourly stay needs starts_at and ends_at")
            if self.starts_at.tzinfo is not None or self.ends_at.tzinfo is not None:
                raise ValueError("starts_at and ends_at are the company's local time, without a zone")
        else:
            if self.starts_at is not None or self.ends_at is not None:
                raise ValueError("A nightly stay takes check_in and check_out")
            if self.check_in is None or self.check_out is None:
                raise ValueError("A nightly stay needs check_in and check_out")
        return self


class PublicOfferBooking(BaseModel):
    """The link's booking as the guest sees it: which flat, until when the dates
    are held, the deposit to pay and the masked number the invoice goes to."""

    flat: str
    # pending: waiting for the deposit; confirmed: the dates are the guest's.
    status: str
    expires_at: datetime | None = None
    deposit: float | None = None
    phone: str
    guests: int
    # What the nights cost for the guests booked, paid at check-in; none when the flat has no price.
    total: float | None = None

    @classmethod
    def from_hold(cls, held: OfferBooking) -> PublicOfferBooking:
        b = held.booking
        return cls(
            flat=held.flat,
            status=b.status.value,
            expires_at=b.expires_at.replace(tzinfo=timezone.utc) if b.expires_at else None,
            deposit=float(held.deposit) if held.deposit is not None else None,
            phone=mask_phone(held.phone),
            guests=b.adults_count + b.children_count,
            total=float(b.total_price) if b.total_price and b.total_price > 0 else None,
        )


class PublicOfferResponse(BaseModel):
    """A guest's personal link: the first name and a masked phone, never more."""

    code: str
    guest: str | None = None
    phone: str
    check_in: date
    check_out: date
    nights: int
    # hourly: the stay is from starts_at to ends_at on check_in's day; nights is 0.
    rental_mode: str = "daily"
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    hours: int | None = None
    guests: int
    flats: list[PublicOfferFlat]
    booking: PublicOfferBooking | None = None

    @classmethod
    def from_offer(cls, public: PublicOffer, held: OfferBooking | None = None) -> PublicOfferResponse:
        o = public.offer
        hourly = o.rental_mode == RentalMode.HOURLY
        return cls(
            code=o.code,
            guest=greeting(o.guest_name),
            phone=mask_phone(o.guest_phone),
            check_in=o.check_in,
            check_out=o.check_out,
            nights=0 if hourly else (o.check_out - o.check_in).days,
            rental_mode=o.rental_mode.value,
            starts_at=o.starts_at,
            ends_at=o.ends_at,
            # As the price counts them: a part of an hour is an hour.
            hours=math.ceil((o.ends_at - o.starts_at).total_seconds() / 3600) if hourly else None,
            guests=o.guests,
            flats=[
                PublicOfferFlat(
                    code=f.property.public_code,
                    name=f.property.name,
                    complex_name=f.property.complex_name,
                    rooms=f.property.rooms,
                    max_guests=f.property.max_guests,
                    area_total=f.property.area_total,
                    floor=f.property.floor,
                    photo=f.photo,
                    total=float(f.total) if f.total is not None else None,
                    free=f.free,
                )
                for f in public.flats
            ],
            booking=PublicOfferBooking.from_hold(held) if held else None,
        )


class StayHereResponse(BaseModel):
    """Whether anyone stays in the flat now: the page offers "I am staying here" then."""

    staying: bool
    by_phone: bool
    mine: bool
    # The phones of the stays going on now, last 4 digits hidden: "+7 (702) 377 ****".
    hints: list[str] = Field(default_factory=list)


class StayKeyBody(BaseModel):
    """The last 4 digits of the phone on the booking."""

    digits: str = Field(pattern=r"^\d{4}$")


class StayKeyResponse(BaseModel):
    """The guest's own page: /g/<guest_code>."""

    guest_code: str
