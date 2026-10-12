"""A flat's calendar as iCal, for Airbnb and Booking.com to read our bookings."""

import uuid
from datetime import date, datetime

import pytest

from app.application.booking.ical_export import blocked_nights, render_calendar
from app.domain.booking.entities import Booking
from app.domain.booking.value_objects import BookingStatus

PROPERTY_ID = uuid.UUID("00000000-0000-0000-0000-0000000000aa")


def _booking(check_in, check_out, status=BookingStatus.CONFIRMED):
    return Booking(property_id=PROPERTY_ID, check_in=check_in, check_out=check_out, status=status)


def test_a_stay_blocks_its_nights():
    nights = blocked_nights([_booking(datetime(2026, 11, 1, 14), datetime(2026, 11, 3, 12))], 14, 12)
    assert nights == [(date(2026, 11, 1), date(2026, 11, 3))]


def test_back_to_back_stays_merge_into_one_block():
    stays = [
        _booking(datetime(2026, 11, 1, 14), datetime(2026, 11, 3, 12)),
        _booking(datetime(2026, 11, 3, 14), datetime(2026, 11, 5, 12)),
    ]
    assert blocked_nights(stays, 14, 12) == [(date(2026, 11, 1), date(2026, 11, 5))]


def test_an_hourly_booking_blocks_the_night_it_touches():
    # 10:00–13:00 overlaps the previous night's stay, which runs until noon.
    morning = _booking(datetime(2026, 11, 5, 10), datetime(2026, 11, 5, 13))
    assert blocked_nights([morning], 14, 12) == [(date(2026, 11, 4), date(2026, 11, 5))]
    # 15:00–18:00 sits inside that evening's night.
    evening = _booking(datetime(2026, 11, 5, 15), datetime(2026, 11, 5, 18))
    assert blocked_nights([evening], 14, 12) == [(date(2026, 11, 5), date(2026, 11, 6))]


def test_a_booking_inside_the_turnover_gap_still_blocks_a_night():
    # 12:00–14:00 touches no night, yet a stay of 4–6 Nov runs straight through it.
    gap = _booking(datetime(2026, 11, 5, 12), datetime(2026, 11, 5, 14))
    assert blocked_nights([gap], 14, 12) == [(date(2026, 11, 5), date(2026, 11, 6))]


def test_a_morning_booking_on_a_night_already_taken_adds_no_other_night():
    stay = _booking(datetime(2026, 11, 3, 14), datetime(2026, 11, 5, 12))
    morning = _booking(datetime(2026, 11, 5, 10), datetime(2026, 11, 5, 11))
    assert blocked_nights([stay, morning], 14, 12) == [(date(2026, 11, 3), date(2026, 11, 5))]


def test_cancelled_bookings_block_nothing():
    cancelled = _booking(datetime(2026, 11, 1, 14), datetime(2026, 11, 3, 12), BookingStatus.CANCELLED)
    assert blocked_nights([cancelled], 14, 12) == []


def test_the_calendar_is_valid_ical_without_guest_details():
    text = render_calendar(PROPERTY_ID, [(date(2026, 11, 1), date(2026, 11, 3))], stamp=datetime(2026, 10, 12, 9, 0))
    lines = text.split("\r\n")
    assert lines[0] == "BEGIN:VCALENDAR" and lines[-2] == "END:VCALENDAR" and lines[-1] == ""
    assert "DTSTART;VALUE=DATE:20261101" in lines and "DTEND;VALUE=DATE:20261103" in lines
    assert text.count("BEGIN:VEVENT") == 1
    assert "SUMMARY:Not available" in lines


# ---------- the public feed ----------


class _Properties:
    def __init__(self, prop):
        self._prop = prop

    async def get_by_id(self, _id):
        return self._prop


class _Bookings:
    asked: list = []

    async def get_by_property_and_dates(self, property_id, start, end, *, exclude_id=None):
        _Bookings.asked.append((start, end))
        return [_booking(datetime(2026, 11, 1, 14), datetime(2026, 11, 3, 12))]


async def _get(monkeypatch, token: str):
    from httpx import ASGITransport, AsyncClient

    from app.infrastructure.database import get_session
    from app.main import app
    from app.presentation.api.v1 import ical

    monkeypatch.setattr(
        ical, "_repos", lambda session: (_Properties(type("P", (), {"id": PROPERTY_ID})()), _Bookings())
    )
    app.dependency_overrides[get_session] = lambda: None
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.get(f"/api/v1/calendar/{PROPERTY_ID}.ics", params={"token": token})
    finally:
        app.dependency_overrides.pop(get_session, None)


@pytest.mark.asyncio
async def test_the_feed_opens_with_the_right_token_only(monkeypatch):
    from app.infrastructure.security import calendar_token

    good = await _get(monkeypatch, calendar_token(PROPERTY_ID))
    assert good.status_code == 200
    assert good.headers["content-type"].startswith("text/calendar")
    assert "DTSTART;VALUE=DATE:20261101" in good.text

    assert (await _get(monkeypatch, "0" * 32)).status_code == 404


@pytest.mark.asyncio
async def test_the_link_is_for_those_who_manage_the_flat(monkeypatch):
    from app.domain.auth.value_objects import UserRole
    from app.infrastructure.security import calendar_token
    from app.presentation.api.v1 import properties
    from tests.test_api_permissions import COMPANY_ID, _Obj, _request, _user_principal

    monkeypatch.setattr(properties, "_repos", lambda session: {"property": _Repo(_Obj(company_id=COMPANY_ID))})
    path = f"/api/v1/properties/{PROPERTY_ID}/calendar-link"
    from app.infrastructure.database import get_session
    from app.main import app

    app.dependency_overrides[get_session] = lambda: None
    try:
        assert await _request("GET", path, _user_principal(UserRole.CLEANER)) == 403
        from httpx import ASGITransport, AsyncClient

        from app.presentation.api.deps import get_principal

        app.dependency_overrides[get_principal] = lambda: _user_principal(UserRole.MANAGER)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            answer = (await client.get(path)).json()
        assert answer["url"].endswith(f"/api/v1/calendar/{PROPERTY_ID}.ics?token={calendar_token(PROPERTY_ID)}")
    finally:
        from app.presentation.api.deps import get_principal

        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_principal, None)


class _Repo:
    def __init__(self, row):
        self._row = row

    async def get_by_id(self, _id):
        return self._row


@pytest.mark.asyncio
async def test_a_token_that_is_not_hex_is_a_404_not_a_500(monkeypatch):
    assert (await _get(monkeypatch, "тест")).status_code == 404


@pytest.mark.asyncio
async def test_the_feed_reaches_two_years_ahead(monkeypatch):
    from datetime import timedelta

    from app.infrastructure.security import calendar_token

    _Bookings.asked.clear()
    await _get(monkeypatch, calendar_token(PROPERTY_ID))
    # Airbnb imports up to two years; a booking beyond the feed could be sold again.
    (_, end), = _Bookings.asked
    assert end >= date.today() + timedelta(days=2 * 366)


def test_the_link_token_stays_out_of_the_logs():
    import logging

    from app.main import _redact_query, _RedactAccessLog

    assert _redact_query("token=0123abcd&x=1") == "token=***&x=1"
    # uvicorn's own access line carries the full path with its query.
    record = logging.LogRecord(
        "uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d',
        ("1.2.3.4:5", "GET", "/api/v1/calendar/x.ics?token=0123abcd", "1.1", 200), None,
    )
    assert _RedactAccessLog().filter(record)
    assert "0123abcd" not in record.getMessage()
