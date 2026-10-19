"""A personal link aidyn sends a guest: one flat or several for the guest's dates,
each with what the stay costs and whether it is still free. The guest's name and
phone stay in Day; the link holds only a random code, and the page shows the
first name and a masked phone — a forwarded link gives away nothing more."""

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.application.booking.guest_offers import GuestOffersService, OfferExpiredError, greeting, mask_phone
from app.domain.auth.permissions import Permission
from app.domain.booking.entities import Booking
from app.domain.booking.value_objects import BookingStatus, RentalMode
from app.domain.property.entities import PricingConfig, Property
from app.domain.property.value_objects import PropertyStatus
from app.presentation.schemas.public import PublicOfferResponse
from tests.test_booking_services import (
    COMPANY_ID,
    FakeBookingRepository,
    FakePricingConfigRepository,
    FakePropertyRepository,
    _build_price_calculator,
)
from tests.test_property_facts import flat  # noqa: F401  (a fixture)


class FakeOfferRepository:
    def __init__(self):
        self._offers = {}

    async def add(self, offer):
        self._offers[offer.code] = offer
        return offer

    async def get_by_code(self, code):
        return self._offers.get(code)


class _Photos:
    async def list_by_property(self, property_id):
        return []


class Offers:
    def __init__(self, today=date(2030, 10, 1)):
        self.today = today
        # The company's clock; an hourly link reads it.
        self.now = datetime(2030, 10, 1, 10)
        self.props = FakePropertyRepository()
        self.pricing = FakePricingConfigRepository()
        self.bookings = FakeBookingRepository()
        self.offers = FakeOfferRepository()
        self.service = GuestOffersService(
            self.offers, self.props, _Photos(), self.bookings,
            _build_price_calculator(pricing_repo=self.pricing), today=lambda: self.today, now=lambda: self.now,
        )

    async def flat(self, name="Студия", price="20000", company_id=COMPANY_ID, status=PropertyStatus.ACTIVE, **facts):
        prop = Property(company_id=company_id, name=name, internal_name=uuid.uuid4().hex[:6], status=status,
                        rooms=1, max_guests=2, check_in_hour=14, check_out_hour=12, **facts)
        await self.props.save(prop)
        await self.pricing.save(PricingConfig(property_id=prop.id, base_price=Decimal(price),
                                              hourly_price=Decimal("3000")))
        return prop

    async def offer(self, *flats, check_in=date(2030, 10, 20), check_out=date(2030, 10, 22), guests=2, **guest):
        return await self.service.create(
            COMPANY_ID,
            guest_name=guest.get("name", "Ерлан Сапаров"),
            guest_phone=guest.get("phone", "+7 701 234 56 78"),
            check_in=check_in,
            check_out=check_out,
            guests=guests,
            property_ids=[f.id for f in flats],
        )


def test_a_phone_shows_its_first_digits_and_its_last_two():
    assert mask_phone("+7 701 234 56 78") == "+7 701 ••• •• 78"
    assert mask_phone("87012345678") == "+7 701 ••• •• 78"
    # Any other number: the last two digits alone.
    assert mask_phone("+998 90 123 45 67") == "••• ••• •• 67"
    assert mask_phone("+49 1512 3456789") == "••• ••• •• 89"


def test_the_page_greets_by_the_first_name_and_never_by_a_number():
    assert greeting("Ерлан Сапаров") == "Ерлан"
    # A contact saved under its number: the number is not shown.
    assert greeting("77012345678") is None
    assert greeting("+7 701 234 56 78") is None
    assert greeting("  ") is None


async def test_a_guest_sees_each_flat_for_the_dates_and_nothing_of_the_others():
    o = Offers()
    studio, family = await o.flat("Студия", "20000"), await o.flat("Двухкомнатная", "25000")
    await o.bookings.create(Booking(company_id=COMPANY_ID, property_id=family.id, status=BookingStatus.CONFIRMED,
                                    check_in=datetime(2030, 10, 21, 14), check_out=datetime(2030, 10, 23, 12)))
    offer = await o.offer(studio, family)
    assert len(offer.code) == 8

    shown = PublicOfferResponse.from_offer(await o.service.public(offer.code))
    assert (shown.guest, shown.phone, shown.nights, shown.guests) == ("Ерлан", "+7 701 ••• •• 78", 2, 2)
    assert [(f.name, f.total, f.free) for f in shown.flats] == [
        ("Студия", 40000.0, True),
        ("Двухкомнатная", 50000.0, False),
    ]
    answer = shown.model_dump_json()
    for secret in ("Сапаров", "234 56", "+7 701 234 56 78", studio.internal_name, str(studio.id)):
        assert secret not in answer, secret


async def test_an_offer_holds_only_the_companys_own_flats_on_sale():
    o = Offers()
    theirs = await o.flat(company_id=uuid.uuid4())
    with pytest.raises(ValueError, match="Property not found"):
        await o.offer(theirs)
    paused = await o.flat(status=PropertyStatus.PAUSED)
    with pytest.raises(ValueError, match="Property not found"):
        await o.offer(paused)
    with pytest.raises(ValueError, match="1 to 10"):
        await o.offer()


async def test_an_offer_is_for_dates_ahead_and_a_stay_of_bounded_length():
    o = Offers(today=date(2030, 10, 1))
    studio = await o.flat()
    with pytest.raises(ValueError, match="past"):
        await o.offer(studio, check_in=date(2030, 9, 30), check_out=date(2030, 10, 2))
    # Every night is priced and checked on each visit: a stay of years would hold the server up.
    with pytest.raises(ValueError, match="120 nights"):
        await o.offer(studio, check_in=date(2030, 10, 2), check_out=date(9999, 12, 31))
    with pytest.raises(ValueError, match="730 days"):
        await o.offer(studio, check_in=date(2032, 10, 2), check_out=date(2032, 10, 4))
    assert await o.offer(studio, check_in=date(2030, 10, 1), check_out=date(2031, 1, 29))


async def test_an_offer_holds_only_flats_that_take_the_stay():
    o = Offers()
    by_hour = await o.flat(rental_mode=RentalMode.HOURLY)
    with pytest.raises(ValueError, match="by the hour"):
        await o.offer(by_hour)
    small = await o.flat()
    with pytest.raises(ValueError, match="up to 2 guests"):
        await o.offer(small, guests=3)
    long_stays = await o.flat(min_nights=3)
    with pytest.raises(ValueError, match="at least 3 nights"):
        await o.offer(long_stays)
    short_stays = await o.flat(max_nights=1)
    with pytest.raises(ValueError, match="at most 1 night"):
        await o.offer(short_stays)


async def test_a_flat_with_no_price_for_a_night_shows_no_sum():
    o = Offers()
    no_night_price = await o.flat(price="0", rental_mode=RentalMode.BOTH)
    shown = await o.service.public((await o.offer(no_night_price)).code)
    assert shown.flats[0].total is None


async def test_a_flat_taken_off_sale_leaves_the_offer():
    o = Offers()
    studio, family = await o.flat("Студия"), await o.flat("Двухкомнатная")
    offer = await o.offer(studio, family)
    family.status = PropertyStatus.PAUSED
    await o.props.save(family)
    assert [f.property.name for f in (await o.service.public(offer.code)).flats] == ["Студия"]


async def test_an_offer_lasts_until_the_check_in_day():
    o = Offers(today=date(2030, 10, 20))
    offer = await o.offer(await o.flat())
    assert (await o.service.public(offer.code)).offer.code == offer.code
    o.today = date(2030, 10, 21)
    with pytest.raises(OfferExpiredError):
        await o.service.public(offer.code)
    with pytest.raises(ValueError, match="Not found"):
        await o.service.public("nosuchcode")


@pytest.mark.integration
async def test_offers_through_the_api(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    soon = date.today() + timedelta(days=10)
    body = {
        "guest_name": "Ерлан Сапаров",
        "guest_phone": "+77012345678",
        "check_in": soon.isoformat(),
        "check_out": (soon + timedelta(days=2)).isoformat(),
        "guests": 2,
        "property_ids": [str(prop)],
    }
    use(Permission.BOOKINGS_READ)
    assert (await client.post("/api/v1/offers", json=body)).status_code == 403

    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE)
    assert (await client.post("/api/v1/offers", json={**body, "guest_phone": "abcde"})).status_code == 422
    created = await client.post("/api/v1/offers", json=body)
    assert created.status_code == 201, created.text
    code = created.json()["code"]
    assert created.json()["url"].endswith(f"/o/{code}")
    assert (await client.post("/api/v1/offers", json={**body, "property_ids": [str(uuid.uuid4())]})).status_code == 404

    use()  # the guest: no credential at all
    page = await client.get(f"/api/v1/public/offers/{code}")
    assert page.status_code == 200, page.text
    assert page.json()["phone"] == "+7 701 ••• •• 78" and "2345678" not in page.text and "Сапаров" not in page.text
    assert page.json()["flats"][0]["total"] == 40000.0
    assert (await client.get("/api/v1/public/offers/nosuchcode")).status_code == 404


async def _hourly(o, *flats, start=datetime(2030, 10, 20, 14), end=datetime(2030, 10, 20, 17), guests=2):
    return await o.service.create(
        COMPANY_ID, guest_name="Ерлан", guest_phone="+7 701 234 56 78", guests=guests,
        property_ids=[f.id for f in flats], rental_mode=RentalMode.HOURLY, starts_at=start, ends_at=end,
    )


async def test_an_hourly_offer_shows_each_flat_for_the_hours():
    o = Offers()
    free = await o.flat("Студия", rental_mode=RentalMode.BOTH)
    busy = await o.flat("Почасовая", rental_mode=RentalMode.HOURLY)
    # Ends inside the guest's hours on the busy flat.
    await o.bookings.create(Booking(company_id=COMPANY_ID, property_id=busy.id, status=BookingStatus.CONFIRMED,
                                    rental_mode=RentalMode.HOURLY,
                                    check_in=datetime(2030, 10, 20, 12), check_out=datetime(2030, 10, 20, 15)))
    offer = await _hourly(o, free, busy)
    assert (offer.check_in, offer.rental_mode) == (date(2030, 10, 20), RentalMode.HOURLY)

    shown = PublicOfferResponse.from_offer(await o.service.public(offer.code))
    assert (shown.rental_mode, shown.hours, shown.nights) == ("hourly", 3, 0)
    # Three hours at 3 000, as an hourly booking counts them.
    assert [(f.name, f.total, f.free) for f in shown.flats] == [("Студия", 9000.0, True), ("Почасовая", 9000.0, False)]


async def test_an_hourly_offer_takes_only_flats_let_by_the_hour_and_up_to_a_day():
    o = Offers()
    nightly = await o.flat("Посуточная", rental_mode=RentalMode.DAILY)
    with pytest.raises(ValueError, match="by the night only"):
        await _hourly(o, nightly)
    hourly = await o.flat("Почасовая", rental_mode=RentalMode.HOURLY)
    with pytest.raises(ValueError, match="24 hours"):
        await _hourly(o, hourly, end=datetime(2030, 10, 21, 15))
    with pytest.raises(ValueError, match="after starts_at"):
        await _hourly(o, hourly, end=datetime(2030, 10, 20, 14))
    with pytest.raises(ValueError, match="past"):
        await _hourly(o, hourly, start=datetime(2030, 9, 30, 14), end=datetime(2030, 9, 30, 16))
    with pytest.raises(ValueError, match="up to 2 guests"):
        await _hourly(o, hourly, guests=3)


async def test_a_closed_span_takes_the_hours_it_covers():
    from app.domain.booking.entities import PropertyBlock

    o = Offers()
    unit = await o.flat("Почасовая", rental_mode=RentalMode.HOURLY)
    unit.check_out_hour = 11
    # Closed for the night of the 19th: from 11:00 on the 19th to 11:00 on the 20th.
    await o.bookings.add_block(PropertyBlock(company_id=COMPANY_ID, property_id=unit.id,
                                             start_date=date(2030, 10, 19), end_date=date(2030, 10, 20)))
    morning = await _hourly(o, unit, start=datetime(2030, 10, 20, 9), end=datetime(2030, 10, 20, 11))
    eleven = await _hourly(o, unit, start=datetime(2030, 10, 20, 11), end=datetime(2030, 10, 20, 13))
    assert (await o.service.public(morning.code)).flats[0].free is False
    assert (await o.service.public(eleven.code)).flats[0].free is True


async def test_an_hourly_offer_is_for_hours_ahead_and_ends_when_they_begin():
    o = Offers()
    unit = await o.flat("Почасовая", rental_mode=RentalMode.HOURLY)
    o.now = datetime(2030, 10, 20, 12)
    # Created at noon for the morning of the same day: a dead link.
    with pytest.raises(ValueError, match="past"):
        await _hourly(o, unit, start=datetime(2030, 10, 20, 9), end=datetime(2030, 10, 20, 11))
    offer = await _hourly(o, unit)  # 14:00–17:00
    assert (await o.service.public(offer.code)).flats[0].free is True
    o.now = datetime(2030, 10, 20, 14)
    with pytest.raises(OfferExpiredError):
        await o.service.public(offer.code)


async def test_the_page_keeps_the_flats_rules_as_a_booking_does():
    o = Offers()
    unit = await o.flat("Почасовая", rental_mode=RentalMode.HOURLY, buffer_minutes=30, min_lead_hours=2)
    # A stay that ends at 14:00, the offer's start: no time to clean.
    await o.bookings.create(Booking(company_id=COMPANY_ID, property_id=unit.id, status=BookingStatus.CONFIRMED,
                                    rental_mode=RentalMode.HOURLY,
                                    check_in=datetime(2030, 10, 20, 11), check_out=datetime(2030, 10, 20, 14)))
    tight = await _hourly(o, unit)
    later = await _hourly(o, unit, start=datetime(2030, 10, 20, 15), end=datetime(2030, 10, 20, 17))
    assert (await o.service.public(tight.code)).flats[0].free is False
    assert (await o.service.public(later.code)).flats[0].free is True
    # An hour before the start the two hours' notice is not kept.
    o.now = datetime(2030, 10, 20, 14)
    assert (await o.service.public(later.code)).flats[0].free is False


async def test_a_flat_let_otherwise_since_the_link_was_made_leaves_it():
    o = Offers()
    hourly, nightly = await o.flat("Почасовая", rental_mode=RentalMode.BOTH), await o.flat("Посуточная")
    by_hours, by_nights = await _hourly(o, hourly), await o.offer(nightly)
    hourly.rental_mode, nightly.rental_mode = RentalMode.DAILY, RentalMode.HOURLY
    assert (await o.service.public(by_hours.code)).flats == []
    assert (await o.service.public(by_nights.code)).flats == []


async def test_an_hourly_offer_of_a_whole_day_is_taken():
    o = Offers()
    unit = await o.flat("Почасовая", rental_mode=RentalMode.HOURLY)
    offer = await _hourly(o, unit, end=datetime(2030, 10, 21, 14))
    assert PublicOfferResponse.from_offer(await o.service.public(offer.code)).hours == 24


def test_an_offer_refuses_the_other_kinds_fields():
    from pydantic import ValidationError

    from app.presentation.schemas.offers import OfferCreate

    base = {"guest_name": "Ерлан", "guest_phone": "+77012345678", "guests": 1, "property_ids": [str(uuid.uuid4())]}
    nights = {"check_in": "2030-10-20", "check_out": "2030-10-21"}
    hours = {"starts_at": "2030-10-20T14:00:00", "ends_at": "2030-10-20T17:00:00"}
    assert OfferCreate(**base, **nights).rental_mode == "daily"
    assert OfferCreate(**base, **hours, rental_mode="hourly").starts_at.hour == 14
    for wrong in ({**nights, **hours}, {**nights, **hours, "rental_mode": "hourly"}, {**hours}):
        with pytest.raises(ValidationError):
            OfferCreate(**base, **wrong)
