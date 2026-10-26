"""A guest opens their booking from the flat's page (/s/<code>?nfc or ?qr): an NFC tag
or a QR code in the flat links there, and the page offers "I am staying here".

Every guest who ever stayed has that link, so it opens nothing by itself: the last 4
digits of the phone on a stay going on now answer with that stay's page code.
"""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from app.application.booking.stay_key import NobodyStayingError, StayKeyService, WrongDigitsError
from app.domain.booking.entities import Booking, Guest, new_guest_code
from app.domain.booking.value_objects import BookingStatus
from app.domain.property.value_objects import PropertyStatus
from app.infrastructure.login_throttle import (
    STAY_KEY_DAILY_TRIES,
    STAY_KEY_MAX_FAILURES,
    LoginThrottle,
    StayKeyThrottle,
)
from app.infrastructure.rate_limiter import _GUEST_BOOK
from tests.test_login_throttle import BrokenRedis, FakeRedis
from tests.test_property_services import COMPANY_ID, _make_property

FLAT_CODE = "knz82cx"
# 27 Oct, 20:00 in Almaty is 15:00 in UTC.
NOW = datetime(2026, 10, 27, 15, tzinfo=timezone.utc)


class _Flats:
    def __init__(self, *flats):
        self.flats = list(flats)

    async def get_by_public_code(self, code):
        return next((f for f in self.flats if f.public_code == code), None)


class _Bookings:
    def __init__(self, *bookings):
        self.bookings = list(bookings)

    async def list_by_property_date_range(self, property_id, start_date, end_date, *, company_id=None):
        return [
            b
            for b in self.bookings
            if b.property_id == property_id
            and (company_id is None or b.company_id == company_id)
            and b.status != BookingStatus.CANCELLED
            and b.check_in.date() < end_date
            and b.check_out.date() > start_date
        ]


class _Guests:
    def __init__(self, *guests):
        self.guests = {g.id: g for g in guests}

    async def get_by_id(self, guest_id):
        return self.guests.get(guest_id)


class _Settings:
    async def get_by_company(self, company_id):
        return SimpleNamespace(time_zone="Asia/Almaty")


def _stay(flat, guest, check_in, check_out, status=BookingStatus.CHECKED_IN, company_id=COMPANY_ID):
    return Booking(
        company_id=company_id, property_id=flat.id, guest_id=guest.id, status=status,
        check_in=check_in, check_out=check_out, guest_code=new_guest_code(),
    )


def _flat(**fields):
    flat = _make_property(name="89auc", **fields)
    flat.public_code = FLAT_CODE
    return flat


def _service(flat, *rows):
    bookings = [r for r in rows if isinstance(r, Booking)]
    guests = [r for r in rows if isinstance(r, Guest)]
    return StayKeyService(_Flats(flat), _Bookings(*bookings), _Guests(*guests), _Settings())


ARINA = Guest(company_id=COMPANY_ID, name="Арина", phone="+7 707 749-69-95")


async def test_the_guest_staying_now_opens_their_booking_by_the_last_4_digits():
    flat = _flat()
    stay = _stay(flat, ARINA, datetime(2026, 10, 26, 14), datetime(2026, 10, 28, 12))
    service = _service(flat, ARINA, stay)

    here = await service.here(FLAT_CODE, None, NOW)
    assert (here.staying, here.by_phone, here.mine) == (True, True, False)
    assert await service.unlock(FLAT_CODE, "6995", NOW) == stay.guest_code
    # The device that remembers the code goes straight to the booking next time.
    assert (await service.here(FLAT_CODE, stay.guest_code, NOW)).mine is True


async def test_wrong_digits_open_nothing():
    flat = _flat()
    service = _service(flat, ARINA, _stay(flat, ARINA, datetime(2026, 10, 26, 14), datetime(2026, 10, 28, 12)))
    with pytest.raises(WrongDigitsError):
        await service.unlock(FLAT_CODE, "1234", NOW)


async def test_a_past_or_a_coming_stay_is_not_staying_now():
    flat = _flat()
    left = _stay(flat, ARINA, datetime(2026, 10, 25, 14), datetime(2026, 10, 27, 12), BookingStatus.CHECKED_IN)
    # Hosts often leave a past stay confirmed: it must not open for whoever has the link.
    forgotten = _stay(flat, ARINA, datetime(2026, 10, 24, 14), datetime(2026, 10, 26, 12), BookingStatus.CONFIRMED)
    tomorrow = _stay(flat, ARINA, datetime(2026, 10, 28, 14), datetime(2026, 10, 29, 12), BookingStatus.CONFIRMED)
    service = _service(flat, ARINA, left, forgotten, tomorrow)

    assert (await service.here(FLAT_CODE, left.guest_code, NOW)).staying is False
    with pytest.raises(NobodyStayingError):
        await service.unlock(FLAT_CODE, "6995", NOW)


async def test_a_closed_or_unconfirmed_stay_opens_nothing():
    flat = _flat()
    for status in (BookingStatus.PENDING, BookingStatus.CANCELLED, BookingStatus.CHECKED_OUT, BookingStatus.COMPLETED):
        stay = _stay(flat, ARINA, datetime(2026, 10, 26, 14), datetime(2026, 10, 28, 12), status)
        service = _service(flat, ARINA, stay)
        assert (await service.here(FLAT_CODE, None, NOW)).staying is False, status


async def test_the_guest_at_the_door_a_little_before_check_in_is_staying():
    flat = _flat()
    # NOW is 20:00 local: a stay from 22:00 is at the door, one from 23:30 not yet.
    soon = _stay(flat, ARINA, datetime(2026, 10, 27, 22), datetime(2026, 10, 28, 12), BookingStatus.CONFIRMED)
    assert (await _service(flat, ARINA, soon).here(FLAT_CODE, None, NOW)).staying is True
    late = _stay(flat, ARINA, datetime(2026, 10, 27, 23, 30), datetime(2026, 10, 28, 12), BookingStatus.CONFIRMED)
    assert (await _service(flat, ARINA, late).here(FLAT_CODE, None, NOW)).staying is False


async def test_back_to_back_hourly_stays_each_open_their_own_booking():
    flat = _flat()
    other = Guest(company_id=COMPANY_ID, name="Мирас", phone="+77011112233")
    ending = _stay(flat, ARINA, datetime(2026, 10, 27, 17), datetime(2026, 10, 27, 20, 30))
    next_ = _stay(flat, other, datetime(2026, 10, 27, 21), datetime(2026, 10, 27, 23), BookingStatus.CONFIRMED)
    service = _service(flat, ARINA, other, ending, next_)
    assert await service.unlock(FLAT_CODE, "6995", NOW) == ending.guest_code
    assert await service.unlock(FLAT_CODE, "2233", NOW) == next_.guest_code


async def test_a_guest_without_a_phone_is_staying_but_cannot_be_checked():
    flat = _flat()
    nameless = Guest(company_id=COMPANY_ID, name="Гость Airbnb", phone=None)
    service = _service(flat, nameless, _stay(flat, nameless, datetime(2026, 10, 26, 14), datetime(2026, 10, 28, 12)))
    here = await service.here(FLAT_CODE, None, NOW)
    assert (here.staying, here.by_phone) == (True, False)
    with pytest.raises(WrongDigitsError):
        await service.unlock(FLAT_CODE, "0000", NOW)


async def test_another_company_s_booking_or_guest_never_opens():
    flat = _flat()
    stranger = uuid.uuid4()
    theirs = _stay(flat, ARINA, datetime(2026, 10, 26, 14), datetime(2026, 10, 28, 12), company_id=stranger)
    assert (await _service(flat, ARINA, theirs).here(FLAT_CODE, None, NOW)).staying is False
    # A guest row of another company behind our booking: its phone does not count.
    alien = Guest(company_id=stranger, name="Чужой", phone="+77070006995")
    ours = _stay(flat, alien, datetime(2026, 10, 26, 14), datetime(2026, 10, 28, 12))
    service = _service(flat, alien, ours)
    assert (await service.here(FLAT_CODE, None, NOW)).by_phone is False
    with pytest.raises(WrongDigitsError):
        await service.unlock(FLAT_CODE, "6995", NOW)


async def test_a_flat_not_on_sale_or_a_wrong_code_is_not_found():
    flat = _flat(status=PropertyStatus.PAUSED)
    service = _service(flat, ARINA, _stay(flat, ARINA, datetime(2026, 10, 26, 14), datetime(2026, 10, 28, 12)))
    for code in (FLAT_CODE, "nope123"):
        with pytest.raises(ValueError):
            await service.here(code, None, NOW)


def test_wrong_digits_lock_the_flat_after_a_few_tries():
    redis = FakeRedis()
    throttle = StayKeyThrottle(redis)
    waits = [throttle.attempt(FLAT_CODE) for _ in range(STAY_KEY_MAX_FAILURES + 1)]
    assert waits[:-1] == [0] * STAY_KEY_MAX_FAILURES and waits[-1] > 0
    # Another flat keeps its own count, and the login counter is apart too.
    assert throttle.attempt("vy4pfyw") == 0
    assert LoginThrottle(redis).attempt(FLAT_CODE) == 0


def test_a_flat_takes_only_so_many_guesses_a_day_and_the_right_digits_do_not_reset_them():
    redis = FakeRedis()
    throttle = StayKeyThrottle(redis)
    allowed = 0
    for _ in range(STAY_KEY_DAILY_TRIES * 2):
        if throttle.attempt(FLAT_CODE) == 0:
            allowed += 1
        # The short lock is over (time passing, here by hand): the guesser comes back.
        redis.delete("stay_key_fail:" + hashlib.sha256(FLAT_CODE.encode()).hexdigest()[:32])
        # The guest opens their booking now and then: that clears the short count only.
        throttle.succeeded(FLAT_CODE)
    assert allowed == STAY_KEY_DAILY_TRIES
    assert redis.ttls["stay_key_day:" + hashlib.sha256(FLAT_CODE.encode()).hexdigest()[:32]] == 86400


def test_with_redis_down_the_digits_wait_and_logins_do_not():
    for redis in (None, BrokenRedis()):
        assert StayKeyThrottle(redis).attempt(FLAT_CODE) > 0
        assert LoginThrottle(redis).attempt("owner@example.com") == 0


def test_the_digits_count_against_the_guest_booking_limit_per_address():
    assert _GUEST_BOOK.match("/api/v1/public/stays/knz82cx/here")


async def test_the_endpoints_answer_and_lock(monkeypatch):
    from app.infrastructure.database import get_session
    from app.infrastructure.login_throttle import get_stay_key_throttle
    from app.main import app
    from app.presentation.api.v1 import public as public_api

    flat = _flat()
    stay = _stay(flat, ARINA, datetime.now() - timedelta(hours=2), datetime.now() + timedelta(hours=20))
    service = _service(flat, ARINA, stay)
    monkeypatch.setattr(public_api, "_stay_key", lambda session: service)
    throttle = StayKeyThrottle(FakeRedis())

    async def _no_db():
        yield None

    app.dependency_overrides[get_session] = _no_db
    app.dependency_overrides[get_stay_key_throttle] = lambda: throttle
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            here = await client.get(f"/api/v1/public/stays/{FLAT_CODE}/here")
            assert here.status_code == 200 and here.json() == {"staying": True, "by_phone": True, "mine": False}
            # The digits only: no letters, no full number.
            letters = await client.post(f"/api/v1/public/stays/{FLAT_CODE}/here", json={"digits": "69a5"})
            assert letters.status_code == 422
            ok = await client.post(f"/api/v1/public/stays/{FLAT_CODE}/here", json={"digits": "6995"})
            assert ok.status_code == 200 and ok.json() == {"guest_code": stay.guest_code}
            for _ in range(STAY_KEY_MAX_FAILURES):
                wrong = await client.post(f"/api/v1/public/stays/{FLAT_CODE}/here", json={"digits": "0000"})
                assert wrong.status_code == 403
            # Locked: the right digits wait too, or the lock would tell which guess was right.
            locked = await client.post(f"/api/v1/public/stays/{FLAT_CODE}/here", json={"digits": "6995"})
            assert locked.status_code == 429 and int(locked.headers["Retry-After"]) > 0
            assert (await client.get("/api/v1/public/stays/nope123/here")).status_code == 404
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_stay_key_throttle, None)
