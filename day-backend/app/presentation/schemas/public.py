"""What a flat's page for guests shows. Every field is named here on purpose: a new
field on the flat stays private until it is added to this list."""

from __future__ import annotations

from datetime import date, datetime, timezone

from pydantic import BaseModel, Field, field_validator

from app.application.booking.guest_hold import OfferBooking
from app.application.booking.guest_offers import PublicOffer, greeting, mask_phone
from app.application.property.public_stay import PublicStay
from app.config import settings
from app.presentation.schemas.offers import full_phone


class PublicAmenity(BaseModel):
    name: str
    category: str


class PublicPrices(BaseModel):
    night: float | None = None
    hour: float | None = None
    deposit: float | None = None


class PublicNightResponse(BaseModel):
    date: date
    price: float
    free: bool


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
                deposit=float(pricing.default_deposit) if pricing and pricing.default_deposit > 0 else None,
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
    guests: int
    flats: list[PublicOfferFlat]
    booking: PublicOfferBooking | None = None

    @classmethod
    def from_offer(cls, public: PublicOffer, held: OfferBooking | None = None) -> PublicOfferResponse:
        o = public.offer
        return cls(
            code=o.code,
            guest=greeting(o.guest_name),
            phone=mask_phone(o.guest_phone),
            check_in=o.check_in,
            check_out=o.check_out,
            nights=(o.check_out - o.check_in).days,
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
