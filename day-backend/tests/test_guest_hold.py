"""A guest books from a personal link: Day holds the dates for 30 minutes and asks
the host to send a Kaspi invoice for the deposit. One link makes one booking at a
time; a hold that lapses lets the guest book again."""

import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal

import pytest

from app.application.booking.create_booking import CreateBookingService
from app.application.booking.guest_hold import GuestHoldService, OfferBooking, OfferTakenError
from app.application.booking.guest_offers import GuestOffersService, OfferExpiredError
from app.application.messaging.notifications import render
from app.domain.auth.permissions import Permission
from app.domain.booking.entities import Booking, Guest
from app.domain.booking.exceptions import BookingOverlapError
from app.domain.booking.value_objects import BookingSource, BookingStatus, DepositStatus, RentalMode
from app.domain.messaging.value_objects import NotificationEvent
from app.domain.property.entities import PricingConfig, Property
from app.domain.property.value_objects import PropertyStatus
from tests.test_booking_services import (
    COMPANY_ID,
    FakeBookingAuditLogRepository,
    FakeBookingDepositRepository,
    FakeBookingRepository,
    FakeGuestRepository,
    FakePricingConfigRepository,
    FakePropertyRepository,
    _build_price_calculator,
)
from tests.test_property_facts import flat  # noqa: F401  (a fixture)

NOW = datetime(2030, 10, 1, 9, 15)


class FakeOfferRepository:
    def __init__(self):
        self._offers = {}

    async def add(self, offer):
        self._offers[offer.code] = offer
        return offer

    async def get_by_code(self, code, *, lock=False):
        return self._offers.get(code)

    async def set_booking(self, offer_id, booking_id):
        for offer in self._offers.values():
            if offer.id == offer_id:
                offer.booking_id = booking_id


class _Photos:
    async def list_by_property(self, property_id):
        return []


class _Sites:
    """The companies that set up their site."""

    def __init__(self, companies):
        self.companies = set(companies)

    async def get(self, company_id):
        return object() if company_id in self.companies else None


class _Blacklist:
    def __init__(self):
        self.phones = set()

    async def find(self, company_id, phone):
        return object() if phone in self.phones else None


class Holds:
    def __init__(self):
        self.today = NOW.date()
        self.now = NOW
        self.props = FakePropertyRepository()
        self.pricing = FakePricingConfigRepository()
        self.bookings = FakeBookingRepository()
        self.guests = FakeGuestRepository()
        self.deposits = FakeBookingDepositRepository()
        self.offers = FakeOfferRepository()
        prices = _build_price_calculator(pricing_repo=self.pricing)
        self.made = GuestOffersService(
            self.offers, self.props, _Photos(), self.bookings, prices, today=lambda: self.today
        )
        create = CreateBookingService(
            self.bookings, self.guests, self.props, FakeBookingAuditLogRepository(), prices
        )
        self.sites = _Sites({COMPANY_ID})
        self.blacklist = _Blacklist()
        self.service = GuestHoldService(
            self.offers, self.props, self.bookings, self.guests, self.pricing, self.deposits, create,
            now=lambda: self.now, sites=self.sites, blacklist=self.blacklist,
        )

    async def flat(self, name="Студия", deposit="10000", status=PropertyStatus.ACTIVE):
        prop = Property(company_id=COMPANY_ID, name=name, internal_name=uuid.uuid4().hex[:6], status=status,
                        rooms=1, max_guests=3, check_in_hour=14, check_out_hour=12)
        await self.props.save(prop)
        await self.pricing.save(PricingConfig(property_id=prop.id, base_price=Decimal("25000"),
                                              default_deposit=Decimal(deposit)))
        return prop

    async def offer(self, *flats):
        return await self.made.create(
            COMPANY_ID, guest_name="Ерлан Сапаров", guest_phone="+7 701 234 56 78",
            check_in=date(2030, 10, 20), check_out=date(2030, 10, 22), guests=2,
            property_ids=[f.id for f in flats],
        )


async def test_a_guest_books_a_flat_of_the_link_and_it_is_held_half_an_hour():
    h = Holds()
    studio, family = await h.flat(), await h.flat("Двухкомнатная")
    offer = await h.offer(studio, family)

    held = await h.service.book(offer.code, flat=family.public_code, guests=2)
    booking = held.booking
    # The CRM tells a booking made by the guest on a personal link from one it made itself.
    assert booking.source == BookingSource.OFFER
    assert (booking.property_id, booking.status, booking.expires_at) == (
        family.id, BookingStatus.PENDING, NOW + timedelta(minutes=30)
    )
    assert (booking.check_in, booking.check_out, booking.adults_count) == (
        datetime(2030, 10, 20, 14), datetime(2030, 10, 22, 12), 2
    )
    assert (await h.guests.get_by_id(booking.guest_id)).phone == "+7 701 234 56 78"
    [deposit] = await h.deposits.get_by_booking(booking.id)
    assert (deposit.amount, deposit.status) == (Decimal("10000"), DepositStatus.PENDING)

    # What the page shows the guest who comes back to the link.
    now = await h.service.current(offer)
    assert (now.flat, now.booking.id, now.deposit, now.phone) == (
        family.public_code, booking.id, Decimal("10000"), "+7 701 234 56 78"
    )


async def test_the_invoice_goes_to_another_number_when_the_guest_gives_one():
    h = Holds()
    studio = await h.flat()
    offer = await h.offer(studio)
    held = await h.service.book(offer.code, flat=studio.public_code, guests=1, name="Айгерим", phone="+77770001122")
    guest = await h.guests.get_by_id(held.booking.guest_id)
    assert (guest.name, guest.phone, held.phone, held.name) == ("Айгерим", "+77770001122", "+77770001122", "Айгерим")


async def test_who_booked_is_told_even_when_the_phone_finds_an_older_guest():
    h = Holds()
    studio = await h.flat()
    offer = await h.offer(studio)
    await h.guests.create(Guest(company_id=COMPANY_ID, name="Старое имя", phone="+77770001122"))
    held = await h.service.book(offer.code, flat=studio.public_code, guests=1, name="Айгерим", phone="+77770001122")
    assert (await h.guests.get_by_id(held.booking.guest_id)).name == "Старое имя"
    assert held.name == "Айгерим" and "Айгерим, +77770001122" in held.booking.notes


async def test_one_link_makes_one_booking_at_a_time():
    h = Holds()
    studio, family = await h.flat(), await h.flat("Двухкомнатная")
    offer = await h.offer(studio, family)
    held = await h.service.book(offer.code, flat=studio.public_code, guests=2)
    with pytest.raises(OfferTakenError):
        await h.service.book(offer.code, flat=family.public_code, guests=2)

    # Not paid in time: the sweep cancels the hold, and the link books again.
    held.booking.status = BookingStatus.CANCELLED
    await h.bookings.update(held.booking)
    assert await h.service.current(offer) is None
    assert (await h.service.book(offer.code, flat=family.public_code, guests=2)).booking.property_id == family.id


async def test_a_guest_books_only_a_flat_of_the_link_still_on_sale():
    h = Holds()
    studio, other, paused = await h.flat(), await h.flat("Чужая"), await h.flat("Снятая")
    offer = await h.offer(studio, paused)
    paused.status = PropertyStatus.PAUSED
    await h.props.save(paused)
    for code in (other.public_code, paused.public_code, "nosuchflat"):
        with pytest.raises(ValueError, match="Not found"):
            await h.service.book(offer.code, flat=code, guests=2)
    with pytest.raises(ValueError, match="up to 3 guests"):
        await h.service.book(offer.code, flat=studio.public_code, guests=4)
    with pytest.raises(ValueError, match="Not found"):
        await h.service.book("nosuchcode", flat=studio.public_code, guests=2)
    # 00:30 on the 21st in Almaty, still the 20th by UTC: the stay has begun.
    h.now = datetime(2030, 10, 20, 19, 30)
    with pytest.raises(OfferExpiredError):
        await h.service.book(offer.code, flat=studio.public_code, guests=2)


async def test_a_flat_let_by_the_hour_since_the_link_was_made_is_not_held_for_nights():
    # The page shows such a flat no nightly deposit: the link must not take one either.
    h = Holds()
    studio = await h.flat()
    offer = await h.offer(studio)
    studio.rental_mode = RentalMode.HOURLY
    await h.props.save(studio)
    with pytest.raises(ValueError, match="by the hour only"):
        await h.service.book(offer.code, flat=studio.public_code, guests=2)
    assert offer.booking_id is None


async def test_a_flat_taken_meanwhile_is_not_held():
    h = Holds()
    studio = await h.flat()
    offer = await h.offer(studio)
    await h.bookings.create(Booking(company_id=COMPANY_ID, property_id=studio.id, status=BookingStatus.CONFIRMED,
                                    check_in=datetime(2030, 10, 21, 14), check_out=datetime(2030, 10, 23, 12)))
    with pytest.raises(BookingOverlapError):
        await h.service.book(offer.code, flat=studio.public_code, guests=2)
    assert offer.booking_id is None


async def test_a_flat_with_no_deposit_is_held_with_none_to_pay():
    h = Holds()
    studio = await h.flat(deposit="0")
    offer = await h.offer(studio)
    held = await h.service.book(offer.code, flat=studio.public_code, guests=2)
    assert held.deposit is None and await h.deposits.get_by_booking(held.booking.id) == []


async def test_the_notice_tells_the_deadline_on_the_company_clock(monkeypatch):
    from app.infrastructure.messaging import booking_notice

    queued = []

    class _Notices:
        async def notify_company(self, company_id, event, payload):
            queued.append((event, payload))

    class _NoSettings:
        async def get_by_company(self, company_id):
            return None

    monkeypatch.setattr(booking_notice, "build_notification_service", lambda session: _Notices())
    h = Holds()
    studio = await h.flat()
    booking = Booking(company_id=COMPANY_ID, property_id=studio.id, check_in=datetime(2030, 10, 20, 14),
                      check_out=datetime(2030, 10, 22, 12), adults_count=2, total_price=Decimal("50000"),
                      expires_at=datetime(2030, 10, 1, 9, 45))
    held = OfferBooking(booking=booking, flat=studio.public_code, deposit=Decimal("10000"),
                        phone="+77012345678", name="Айгерим")
    await booking_notice.notify_guest_hold(None, held, h.props, _NoSettings())
    [(event, payload)] = queued
    assert event == NotificationEvent.GUEST_HOLD
    # 09:45 UTC is 14:45 in Almaty, the company's default clock.
    assert (payload["until"], payload["guest_name"], payload["deposit"], payload["total_price"]) == (
        "14:45", "Айгерим", "10000", "50000"
    )


def test_the_host_is_asked_to_send_the_kaspi_invoice():
    payload = {
        "property_name": "Двухкомнатная", "guest_name": "Ерлан Сапаров", "phone": "+7 701 234 56 78",
        "check_in": "20.10.2030 14:00", "check_out": "22.10.2030 12:00", "guests": 2,
        "deposit": "10000", "total_price": "50000", "until": "14:45", "booking_id": str(uuid.uuid4()),
    }
    text = render(NotificationEvent.GUEST_HOLD, payload)
    for part in ("счёт Kaspi", "10 000 ₸", "+7 701 234 56 78", "Ерлан Сапаров", "до 14:45", "50 000 ₸"):
        assert part in text, part
    from_site = render(NotificationEvent.GUEST_HOLD, {**payload, "source": "site"})
    assert "по ссылке гостя" in text and "с сайта" in from_site
    no_deposit = render(NotificationEvent.GUEST_HOLD, {**payload, "deposit": None})
    assert "Kaspi" not in no_deposit and "подтвердите" in no_deposit


@pytest.mark.integration
async def test_booking_from_a_link_through_the_api(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    soon = date.today() + timedelta(days=10)
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ)
    created = await client.post("/api/v1/offers", json={
        "guest_name": "Ерлан Сапаров", "guest_phone": "+77012345678", "check_in": soon.isoformat(),
        "check_out": (soon + timedelta(days=2)).isoformat(), "guests": 2, "property_ids": [str(prop)],
    })
    assert created.status_code == 201, created.text
    code = created.json()["code"]
    flat_code = (await client.get(f"/api/v1/properties/{prop}")).json()["public_code"]

    use()  # the guest: no credential at all
    wrong = await client.post(f"/api/v1/public/offers/{code}/book", json={"flat": "nosuchflat", "guests": 2})
    assert wrong.status_code == 404
    booked = await client.post(f"/api/v1/public/offers/{code}/book", json={"flat": flat_code, "guests": 2})
    assert booked.status_code == 201, booked.text
    assert booked.json()["flat"] == flat_code and booked.json()["phone"] == "+7 701 ••• •• 78"
    assert booked.json()["expires_at"] and (booked.json()["guests"], booked.json()["total"]) == (2, 40000.0)
    again = await client.post(f"/api/v1/public/offers/{code}/book", json={"flat": flat_code, "guests": 2})
    assert again.status_code == 409
    no_link = await client.post("/api/v1/public/offers/nosuchcode/book", json={"flat": flat_code, "guests": 2})
    assert no_link.status_code == 404
    page = (await client.get(f"/api/v1/public/offers/{code}")).json()
    assert page["booking"]["flat"] == flat_code and page["booking"]["status"] == "pending"
    assert "2345678" not in str(page)


@pytest.mark.integration
async def test_a_booking_from_a_link_carries_the_crms_conversation_to_the_feed(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    soon = date.today() + timedelta(days=12)
    conversation = str(uuid.uuid4())
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ)
    offer = {"guest_name": "Ерлан", "guest_phone": "+77012345679", "check_in": soon.isoformat(),
             "check_out": (soon + timedelta(days=1)).isoformat(), "guests": 1, "property_ids": [str(prop)]}
    assert (await client.post("/api/v1/offers", json={**offer, "external_id": "x" * 256})).status_code == 422
    created = await client.post("/api/v1/offers", json={**offer, "external_id": conversation})
    assert created.status_code == 201, created.text
    assert created.json()["external_id"] == conversation
    code = created.json()["code"]
    flat_code = (await client.get(f"/api/v1/properties/{prop}")).json()["public_code"]

    use()  # the guest
    assert conversation not in (await client.get(f"/api/v1/public/offers/{code}")).text
    booked = await client.post(f"/api/v1/public/offers/{code}/book", json={"flat": flat_code, "guests": 1})
    assert booked.status_code == 201, booked.text
    assert conversation not in booked.text

    # The feed shows a change some 30 s later, from the same booking's external_id.
    use(Permission.BOOKINGS_READ)
    listed = (await client.get("/api/v1/bookings", params={"source": "offer"})).json()["items"]
    assert [(b["external_id"], b["status"]) for b in listed] == [(conversation, "pending")]


@pytest.mark.integration
async def test_an_hourly_link_books_the_hours_with_the_hourly_deposit(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    day = date.today() + timedelta(days=14)
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert (await client.patch(f"/api/v1/properties/{prop}", json={"rental_mode": "both"})).status_code == 200
    priced = await client.put(f"/api/v1/properties/{prop}/pricing", json={
        "base_price": 20000, "hourly_price": 3000, "default_deposit": 10000, "hourly_deposit": 5000,
    })
    assert priced.status_code == 200, priced.text
    offer = {"guest_name": "Ерлан", "guest_phone": "+77012345670", "guests": 2, "property_ids": [str(prop)],
             "rental_mode": "hourly", "starts_at": f"{day}T15:00:00", "ends_at": f"{day}T18:00:00"}
    assert (await client.post("/api/v1/offers", json={**offer, "ends_at": None})).status_code == 422
    zoned = {**offer, "starts_at": f"{day}T15:00:00+05:00"}
    assert (await client.post("/api/v1/offers", json=zoned)).status_code == 422
    created = await client.post("/api/v1/offers", json=offer)
    assert created.status_code == 201, created.text
    body = created.json()
    assert (body["rental_mode"], body["check_in"], body["starts_at"]) == ("hourly", str(day), f"{day}T15:00:00")
    code = body["code"]
    flat_code = (await client.get(f"/api/v1/properties/{prop}")).json()["public_code"]

    use()  # the guest
    page = (await client.get(f"/api/v1/public/offers/{code}")).json()
    assert (page["rental_mode"], page["hours"], page["flats"][0]["total"], page["flats"][0]["free"]) == (
        "hourly", 3, 9000.0, True
    )
    booked = await client.post(f"/api/v1/public/offers/{code}/book", json={"flat": flat_code, "guests": 2})
    assert booked.status_code == 201, booked.text
    assert (booked.json()["deposit"], booked.json()["total"]) == (5000.0, 9000.0)

    use(Permission.BOOKINGS_READ)
    [made] = (await client.get("/api/v1/bookings", params={"source": "offer"})).json()["items"]
    assert (made["rental_mode"], made["check_in"], made["check_out"], made["status"]) == (
        "hourly", f"{day}T15:00:00", f"{day}T18:00:00", "pending"
    )


async def test_an_hourly_link_is_not_booked_once_its_hours_began():
    from app.application.booking.guest_offers import OfferExpiredError

    h = Holds()
    unit = await h.flat()
    unit.rental_mode = RentalMode.HOURLY
    day = NOW.date() + timedelta(days=1)
    offer = await h.made.create(
        COMPANY_ID, guest_name="Ерлан", guest_phone="+7 701 234 56 78", guests=2, property_ids=[unit.id],
        rental_mode=RentalMode.HOURLY,
        starts_at=datetime.combine(day, time(15)),
        ends_at=datetime.combine(day, time(18)),
    )
    # 10:30 UTC is 15:30 in Almaty: the hours began half an hour ago, the same day.
    h.now = datetime.combine(day, time(10, 30))
    with pytest.raises(OfferExpiredError):
        await h.service.book(offer.code, flat=unit.public_code, guests=2)
    h.now = datetime.combine(day, time(9, 30))  # 14:30 in Almaty
    held = await h.service.book(offer.code, flat=unit.public_code, guests=2)
    assert (held.booking.rental_mode, held.booking.check_in) == (RentalMode.HOURLY, datetime.combine(day, time(15)))


async def _site(h, unit, **kw):
    base = dict(rental_mode=RentalMode.DAILY, check_in=date(2030, 10, 20), check_out=date(2030, 10, 22),
                guests=2, name="Айгерим", phone="+7 701 555 44 33")
    return await h.service.book_stay(unit.public_code, **{**base, **kw})


async def test_a_guest_books_from_the_flats_page_and_it_is_held_half_an_hour():
    h = Holds()
    unit = await h.flat()

    held = await _site(h, unit)

    b = held.booking
    assert (b.source, b.status, b.expires_at, b.property_id) == (
        BookingSource.SITE, BookingStatus.PENDING, NOW + timedelta(minutes=30), unit.id
    )
    assert (b.check_in, b.check_out) == (datetime(2030, 10, 20, 14), datetime(2030, 10, 22, 12))
    assert (held.deposit, held.name) == (Decimal("10000"), "Айгерим")
    # The guest found by phone may carry an older name: who booked is in the notes.
    assert "С формы: Айгерим, +7 701 555 44 33" in b.notes


async def test_one_phone_holds_one_booking_from_a_flats_page():
    h = Holds()
    first, second = await h.flat(), await h.flat("Двухкомнатная")
    await _site(h, first)
    with pytest.raises(OfferTakenError, match="cannot be held"):
        await _site(h, second)
    # Once the hold lapses, the phone books again.
    h.now = NOW + timedelta(minutes=31)
    assert (await _site(h, second)).booking.property_id == second.id


async def test_a_flats_page_books_only_for_a_company_with_its_site_set_up():
    h = Holds()
    unit = await h.flat()
    h.sites.companies.clear()
    with pytest.raises(ValueError, match="Not found"):
        await _site(h, unit)


async def test_a_flat_holds_three_unpaid_bookings_from_its_page_at_most():
    h = Holds()
    unit = await h.flat()
    for n in range(3):
        day = date(2030, 10, 20 + 2 * n)
        await _site(h, unit, check_in=day, check_out=day + timedelta(days=1), phone=f"+7701555440{n}")
    with pytest.raises(OfferTakenError, match="cannot be held"):
        await _site(h, unit, check_in=date(2030, 11, 1), check_out=date(2030, 11, 2), phone="+77015554409")


async def test_a_blacklisted_guest_is_refused_like_any_other():
    h = Holds()
    unit = await h.flat()
    h.blacklist.phones.add("+77015554433")
    with pytest.raises(OfferTakenError, match="cannot be held"):
        await _site(h, unit, phone="8 701 555 44 33")


async def test_a_flats_page_books_only_what_the_flat_takes():
    h = Holds()
    unit = await h.flat()
    with pytest.raises(ValueError, match="by the night only"):
        await _site(h, unit, rental_mode=RentalMode.HOURLY, check_in=None, check_out=None,
                    starts_at=datetime(2030, 10, 20, 15), ends_at=datetime(2030, 10, 20, 18))
    with pytest.raises(ValueError, match="past"):
        await _site(h, unit, check_in=date(2030, 9, 1), check_out=date(2030, 9, 2))
    with pytest.raises(ValueError, match="up to 3 guests"):
        await _site(h, unit, guests=4)
    with pytest.raises(ValueError, match="Not found"):
        await h.service.book_stay("nosuch", rental_mode=RentalMode.DAILY, check_in=date(2030, 10, 20),
                                  check_out=date(2030, 10, 21), guests=1, name="x", phone="+77010000000")


def test_guest_booking_gets_the_tight_limit():
    from starlette.requests import Request

    from app.infrastructure.rate_limiter import _limit_for

    for path in ("/api/v1/public/stays/abc/book", "/api/v1/public/offers/abc/book"):
        assert _limit_for(Request({"type": "http", "method": "POST", "path": path, "headers": []})) == ("guestbook", 5)
    page = Request({"type": "http", "method": "GET", "path": "/api/v1/public/stays/abc", "headers": []})
    assert _limit_for(page)[0] == "get"


@pytest.mark.integration
async def test_booking_from_a_flats_page_through_the_api(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    day = date.today() + timedelta(days=20)
    use(Permission.PROPERTIES_READ)
    code = (await client.get(f"/api/v1/properties/{prop}")).json()["public_code"]
    stay = {"check_in": day.isoformat(), "check_out": (day + timedelta(days=2)).isoformat(), "guests": 2,
            "name": "Айгерим", "phone": "+77015554431"}

    use()  # a guest
    # Before the company sets up its site, the page books nothing.
    assert (await client.post(f"/api/v1/public/stays/{code}/book", json=stay)).status_code == 404
    use(Permission.SETTINGS_WRITE)
    await client.put("/api/v1/site", json={"slug": f"t-{uuid.uuid4().hex[:8]}", "title": "Munar"})
    use()
    assert (await client.post(f"/api/v1/public/stays/{code}/book", json={**stay, "phone": "12"})).status_code == 422
    booked = await client.post(f"/api/v1/public/stays/{code}/book", json=stay)
    assert booked.status_code == 201, booked.text
    assert booked.json()["phone"] == "+7 701 ••• •• 31" and booked.json()["total"] == 40000.0
    # The same number written another way is the same guest.
    later = {**stay, "phone": "+7 (701) 555-44-31", "check_in": (day + timedelta(days=5)).isoformat(),
             "check_out": (day + timedelta(days=6)).isoformat()}
    assert (await client.post(f"/api/v1/public/stays/{code}/book", json=later)).status_code == 409
    taken = {**stay, "phone": "+77015554432"}
    assert (await client.post(f"/api/v1/public/stays/{code}/book", json=taken)).status_code == 409

    use(Permission.BOOKINGS_READ)
    [made] = (await client.get("/api/v1/bookings", params={"source": "site"})).json()["items"]
    assert (made["status"], made["guest_name"]) == ("pending", "Айгерим")
