"""A flat's page for guests, opened by a link with no sign-in: what the flat is,
what a night costs and which nights are free. Nothing that lets a stranger find
the door: no internal name (it holds the flat's number), address, entrance,
codes, Wi-Fi, check-in instructions or check-in photos."""

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.application.booking.price_calculator import nightly_rates
from app.application.property.public_stay import GetPublicStayService
from app.domain.auth.permissions import Permission
from app.domain.booking.entities import Booking, PropertyBlock
from app.domain.booking.value_objects import BookingStatus, RentalMode
from app.domain.property.entities import Amenity, PricingConfig, Property, PropertyPhoto, SeasonalPrice
from app.domain.property.value_objects import AmenityCategory, FactAudience, PropertyStatus
from app.presentation.schemas.public import PublicStayResponse
from tests.test_booking_services import (
    COMPANY_ID,
    FakeBookingRepository,
    FakeDayPriceRepository,
    FakePricingConfigRepository,
    FakePropertyRepository,
    FakeSeasonalPriceRepository,
    _build_price_calculator,
)
from tests.test_property_facts import flat  # noqa: F401  (a fixture)

SECRETS = [
    "89auc", "Райымбека 210/4", "кв. 89", "подъезд 3", "блок Б", "Home-89", "pass-89", "Код 4471", "43.2389",
    # The map pins the building, and the video may be the one of the lock.
    "maps.google.com", "lock-video",
]


class _Photos:
    def __init__(self, photos):
        self._photos = photos

    async def list_by_property(self, property_id):
        return [p for p in self._photos if p.property_id == property_id]


class _Amenities:
    async def get_property_amenities(self, property_id):
        return [Amenity(name="Wi-Fi", category=AmenityCategory.COMFORT), Amenity(name="Кондиционер")]


class Stay:
    def __init__(self):
        self.props = FakePropertyRepository()
        self.pricing = FakePricingConfigRepository()
        self.seasonal = FakeSeasonalPriceRepository()
        self.days = FakeDayPriceRepository()
        self.bookings = FakeBookingRepository()

    async def flat(self, status=PropertyStatus.ACTIVE, **pricing) -> Property:
        prop = Property(
            company_id=COMPANY_ID,
            name="Двухкомнатная квартира в ЖК Auezov City",
            internal_name="89auc",
            status=status,
            rental_mode=RentalMode.BOTH,
            description="Светлая квартира, окна во двор.",
            address_full="Алматы, Райымбека 210/4",
            apartment_number="кв. 89",
            entrance="подъезд 3",
            block="блок Б",
            complex_name="Auezov City",
            floor=10,
            rooms=2,
            beds=2,
            max_guests=4,
            area_total=55.0,
            latitude=43.2389,
            longitude=76.8897,
            check_in_hour=14,
            check_out_hour=12,
            check_in_instructions="Код 4471, ключница у двери",
            wifi_name="Home-89",
            wifi_password="pass-89",
            house_rules="Без вечеринок",
            map_url="https://maps.google.com/?q=43.2389,76.8897",
            video_url="https://youtu.be/lock-video",
        )
        await self.props.save(prop)
        await self.pricing.save(PricingConfig(property_id=prop.id, base_price=Decimal("25000"), **pricing))
        return prop

    def service(self, photos=()):
        return GetPublicStayService(
            self.props, _Photos(list(photos)), _Amenities(), self.pricing, self.seasonal, self.days, self.bookings
        )


async def test_a_guest_sees_the_flat_and_none_of_its_secrets():
    s = Stay()
    prop = await s.flat(hourly_price=Decimal("3000"), default_deposit=Decimal("10000"))
    # A listing photo's address holds the flat's id, as storage names it: that id opens
    # nothing without signing in, so it may be seen.
    listing_photo = f"https://files.example/day/properties/{prop.id}/a.jpg"
    photos = [
        PropertyPhoto(property_id=prop.id, url=listing_photo, sort_order=1),
        PropertyPhoto(property_id=prop.id, url="https://files.example/checkin/door.jpg", audience=FactAudience.GUEST),
    ]
    stay = await s.service(photos).execute(prop.public_code, date(2030, 10, 1), date(2030, 10, 8))
    answer = PublicStayResponse.from_stay(stay).model_dump_json()
    for secret in SECRETS + ["checkin/door.jpg"]:
        assert secret not in answer, secret
    shown = PublicStayResponse.from_stay(stay)
    assert (shown.name, shown.max_guests, shown.area_total, shown.complex_name) == (
        "Двухкомнатная квартира в ЖК Auezov City", 4, 55.0, "Auezov City"
    )
    assert shown.photos == [listing_photo]
    assert [a.name for a in shown.amenities] == ["Wi-Fi", "Кондиционер"]
    assert (shown.prices.night, shown.prices.hour, shown.prices.deposit) == (25000.0, 3000.0, 10000.0)


async def test_each_night_shows_its_price_and_whether_it_is_free():
    s = Stay()
    prop = await s.flat(weekend_markup=Decimal("2000"))
    config = await s.pricing.get_by_property(prop.id)
    await s.seasonal.save(
        SeasonalPrice(pricing_config_id=config.id, name="Осень", start_date=date(2030, 10, 6),
                      end_date=date(2030, 10, 7), price_per_night=Decimal("30000"))
    )
    await s.days.set_prices(COMPANY_ID, prop.id, [date(2030, 10, 2)], Decimal("40000"))
    # 1 Oct 2030 is a Tuesday; the 4th a Friday.
    await s.bookings.create(Booking(company_id=COMPANY_ID, property_id=prop.id, status=BookingStatus.CONFIRMED,
                                    check_in=datetime(2030, 10, 1, 14), check_out=datetime(2030, 10, 2, 12)))
    # Gone early or cancelled: no night is held. By the hour from 10:00 on the
    # 6th: the night before is held, as a booking would find it.
    for status, mode, start, end in [
        (BookingStatus.COMPLETED, RentalMode.DAILY, datetime(2030, 10, 3, 14), datetime(2030, 10, 4, 12)),
        (BookingStatus.CANCELLED, RentalMode.DAILY, datetime(2030, 10, 5, 14), datetime(2030, 10, 6, 12)),
        (BookingStatus.CONFIRMED, RentalMode.HOURLY, datetime(2030, 10, 6, 10), datetime(2030, 10, 6, 12)),
    ]:
        await s.bookings.create(Booking(company_id=COMPANY_ID, property_id=prop.id, status=status, rental_mode=mode,
                                        check_in=start, check_out=end))
    await s.bookings.add_block(PropertyBlock(company_id=COMPANY_ID, property_id=prop.id,
                                             start_date=date(2030, 10, 7), end_date=date(2030, 10, 8),
                                             starts_at=datetime(2030, 10, 7, 12), ends_at=datetime(2030, 10, 8, 12)))

    stay = await s.service().execute(prop.public_code, date(2030, 10, 1), date(2030, 10, 8))
    assert [(n.date.day, int(n.price), n.free) for n in stay.nights] == [
        (1, 25000, False),
        (2, 40000, True),
        (3, 25000, True),
        (4, 27000, True),
        # Night 5 runs to noon of the 6th, when the hourly guest is in: taken.
        (5, 27000, False),
        (6, 30000, True),
        (7, 30000, False),
    ]


async def test_a_flat_shows_only_the_prices_it_takes():
    s = Stay()
    by_hour = await s.flat(hourly_price=Decimal("3000"))
    by_hour.rental_mode = RentalMode.HOURLY
    await s.props.save(by_hour)
    found = await s.service().execute(by_hour.public_code, date(2030, 10, 1), date(2030, 10, 3))
    stay = PublicStayResponse.from_stay(found)
    assert (stay.prices.night, stay.prices.hour, stay.nights) == (None, 3000.0, [])

    by_night = await s.flat(hourly_price=Decimal("3000"))
    by_night.rental_mode = RentalMode.DAILY
    await s.props.save(by_night)
    found = await s.service().execute(by_night.public_code, date(2030, 10, 1), date(2030, 10, 3))
    stay = PublicStayResponse.from_stay(found)
    assert (stay.prices.night, stay.prices.hour, len(stay.nights)) == (25000.0, None, 2)


async def test_only_an_active_flat_has_a_page():
    s = Stay()
    for status in (PropertyStatus.NEW, PropertyStatus.PAUSED, PropertyStatus.ARCHIVED):
        prop = await s.flat(status=status)
        with pytest.raises(ValueError, match="Not found"):
            await s.service().execute(prop.public_code, date(2030, 10, 1), date(2030, 10, 8))
    with pytest.raises(ValueError, match="Not found"):
        await s.service().execute("nosuchcode", date(2030, 10, 1), date(2030, 10, 8))


def test_every_flat_gets_its_own_short_code():
    codes = {Property().public_code for _ in range(200)}
    assert len(codes) == 200
    assert all(len(code) == 7 and code.isalnum() and code.islower() for code in codes)


async def test_the_calendar_and_the_booking_count_the_same_nights():
    s = Stay()
    prop = await s.flat(weekend_markup=Decimal("2000"))
    config = await s.pricing.get_by_property(prop.id)
    await s.days.set_prices(COMPANY_ID, prop.id, [date(2030, 10, 2)], Decimal("40000"))
    calc = _build_price_calculator(s.pricing, s.seasonal, day_price_repo=s.days)
    total = (await calc.calculate(prop.id, date(2030, 10, 1), date(2030, 10, 6), 1, 0)).total
    rates = nightly_rates(config, [], {date(2030, 10, 2): Decimal("40000")}, date(2030, 10, 1), 5)
    assert sum(rate.price for rate in rates) == total


@pytest.mark.integration
async def test_the_page_through_the_api(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.PROPERTIES_READ)
    code = (await client.get(f"/api/v1/properties/{prop}")).json()["public_code"]
    assert code

    use()  # no credential at all
    soon = date.today() + timedelta(days=30)
    week = {"date_from": soon.isoformat(), "date_to": (soon + timedelta(days=7)).isoformat()}
    page = await client.get(f"/api/v1/public/stays/{code}", params=week)
    assert page.status_code == 200, page.text
    body = page.json()
    assert body["prices"]["night"] == 20000.0 and len(body["nights"]) == 7
    assert "internal_name" not in body and "t13" not in page.text
    assert (await client.get("/api/v1/public/stays/nosuchcode")).status_code == 404
    too_long = {"date_from": soon.isoformat(), "date_to": (soon + timedelta(days=365)).isoformat()}
    assert (await client.get(f"/api/v1/public/stays/{code}", params=too_long)).status_code == 422
    # Not the flat's past (its bookings), nor years ahead, nor a date past the calendar's end.
    for window in ({"date_from": "2020-01-01", "date_to": "2020-02-01"}, {"date_from": "2040-01-01"},
                   {"date_from": "9999-12-01"}):
        assert (await client.get(f"/api/v1/public/stays/{code}", params=window)).status_code == 422, window
