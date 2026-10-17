"""What a flat's page for guests shows. Every field is named here on purpose: a new
field on the flat stays private until it is added to this list."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.application.property.public_stay import PublicStay


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
    map_url: str | None = None
    video_url: str | None = None
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
            check_in_hour=p.check_in_hour,
            check_out_hour=p.check_out_hour,
            check_in_method=p.check_in_method.value if p.check_in_method else None,
            house_rules=p.house_rules,
            min_nights=p.min_nights,
            map_url=p.map_url,
            video_url=p.video_url,
            photos=stay.photos,
            amenities=[PublicAmenity(name=a.name, category=a.category.value) for a in stay.amenities],
            prices=PublicPrices(
                night=float(pricing.base_price) if pricing else None,
                hour=float(pricing.hourly_price) if pricing and pricing.hourly_price > 0 else None,
                deposit=float(pricing.default_deposit) if pricing and pricing.default_deposit > 0 else None,
            ),
            nights=[PublicNightResponse(date=n.date, price=float(n.price), free=n.free) for n in stay.nights],
        )
