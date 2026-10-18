"""Calendars of Airbnb, Booking.com and other platforms, taken into Day: each
event closes its nights with a block, as a booking elsewhere would. A block
that lands on a Day booking is a double sale: it stays (the night is sold
there) and the owner hears of it in Telegram once."""

import uuid
from datetime import date, datetime

import pytest

from app.application.booking.calendar_feeds import CalendarFeedsService, FeedError, parse_events
from app.application.booking.manage_blocks import ManageBlocksService
from app.domain.auth.permissions import Permission
from app.domain.booking.exceptions import BlockFromCalendarError, PropertyBlockedError
from app.domain.booking.value_objects import BookingSource
from tests.test_booking_services import COMPANY_ID
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_stay_rules_bookings import Flats

AIRBNB = (
    "BEGIN:VCALENDAR\r\nPRODID;X-RICAL-TZSOURCE=TZINFO:-//Airbnb Inc//Hosting Calendar 1.0//EN\r\n"
    "VERSION:2.0\r\nBEGIN:VEVENT\r\nDTEND;VALUE=DATE:20301012\r\nDTSTART;VALUE=DATE:20301010\r\n"
    "UID:1418fb94e984-ac2b0aa6c5c0aaca@airbnb.com\r\nDESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/\r\n"
    " reservations/details/HMXXXX\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\n"
    "DTEND;VALUE=DATE:20301021\r\nDTSTART;VALUE=DATE:20301020\r\nUID:7f662ec65913-a3f9@airbnb.com\r\n"
    "SUMMARY:Airbnb (Not available)\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
)
# Booking.com: no DTSTAMP, "CLOSED - Not available".
BOOKING = (
    "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Booking.com//NONSGML//EN\nBEGIN:VEVENT\n"
    "UID:a1b2c3@booking.com\nDTSTART;VALUE=DATE:20301101\nDTEND;VALUE=DATE:20301104\n"
    "SUMMARY:CLOSED - Not available\nEND:VEVENT\nBEGIN:VEVENT\nUID:gone@booking.com\nSTATUS:CANCELLED\n"
    "DTSTART;VALUE=DATE:20301110\nDTEND;VALUE=DATE:20301111\nEND:VEVENT\nBEGIN:VEVENT\nUID:t@x\n"
    "DTSTART:20301120T140000Z\nEND:VEVENT\nEND:VCALENDAR\n"
)


def test_the_platforms_calendars_read_as_nights():
    assert [(e.uid, e.start, e.end) for e in parse_events(AIRBNB)] == [
        ("1418fb94e984-ac2b0aa6c5c0aaca@airbnb.com", date(2030, 10, 10), date(2030, 10, 12)),
        ("7f662ec65913-a3f9@airbnb.com", date(2030, 10, 20), date(2030, 10, 21)),
    ]
    # A cancelled event is no night; one with no end takes its day's night.
    assert [(e.uid, e.start, e.end) for e in parse_events(BOOKING)] == [
        ("a1b2c3@booking.com", date(2030, 11, 1), date(2030, 11, 4)),
        ("t@x", date(2030, 11, 20), date(2030, 11, 21)),
    ]
    with pytest.raises(FeedError):
        parse_events("<html>Sign in</html>")


def test_a_calendar_cut_short_is_an_error_not_fewer_nights():
    # The download broke after the first event: the rest of the nights are not free.
    cut = AIRBNB[: AIRBNB.index("BEGIN:VEVENT", AIRBNB.index("END:VEVENT"))]
    with pytest.raises(FeedError, match="cut short"):
        parse_events(cut)
    with pytest.raises(FeedError, match="cut short"):
        parse_events(AIRBNB[:-30])
    # An event that never ended was cut too, even if the calendar's end came after it.
    with pytest.raises(FeedError, match="cut short"):
        parse_events("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART;VALUE=DATE:20301010\nEND:VCALENDAR\n")
    with pytest.raises(FeedError, match="cut short"):
        parse_events(
            "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART;VALUE=DATE:20301010\n"
            "BEGIN:VEVENT\nUID:b\nDTSTART;VALUE=DATE:20301020\nEND:VEVENT\nEND:VCALENDAR\n"
        )
    # Empty and whole is true: every booking there is gone.
    assert parse_events("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n") == []


def test_the_parser_keeps_every_event_or_says_why_not():
    # Lower case and trailing spaces, a DURATION for the end, two events with one UID.
    text = (
        "BEGIN:VCALENDAR\nbegin:vevent \nUID:x\nDTSTART;VALUE=DATE:20301001\nDURATION:P2D\nend:vevent\n"
        "BEGIN:VEVENT\nUID:x\nDTSTART;VALUE=DATE:20301005\nDTEND;VALUE=DATE:20301006\nEND:VEVENT\nEND:VCALENDAR\n"
    )
    events = parse_events(text)
    assert [(e.start, e.end) for e in events] == [
        (date(2030, 10, 1), date(2030, 10, 3)),
        (date(2030, 10, 5), date(2030, 10, 6)),
    ]
    assert len({e.uid for e in events}) == 2
    # An event whose nights cannot be told is an error, not a free night.
    for broken in ("DTSTART;VALUE=DATE:20301340", "DTSTART;VALUE=DATE:99991231", "SUMMARY:Reserved"):
        with pytest.raises(FeedError):
            parse_events(f"BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:y\n{broken}\nEND:VEVENT\nEND:VCALENDAR\n")
    # A very long UID is kept short.
    long = parse_events(
        f"BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:{'u' * 900}\nDTSTART;VALUE=DATE:20301001\nEND:VEVENT\nEND:VCALENDAR\n"
    )
    assert len(long[0].uid) <= 200


class Feeds(Flats):
    def __init__(self, text=AIRBNB, today=date(2030, 10, 1)):
        super().__init__()
        self.text = text
        self.clashes: list = []

        async def fetch(url):
            if isinstance(self.text, Exception):
                raise self.text
            return self.text

        async def notify(feed, prop, clashes):
            self.clashes.append([(b.start_date, b.end_date) for b in clashes])

        self.service = CalendarFeedsService(
            FakeCalendarFeedRepository(self.bookings), self.bookings, self.props, fetch, notify, today=lambda: today
        )

    async def add(self, company_id, property_id, name, url):
        feed = await self.service.add(company_id, property_id, name, url)
        await self.service.read(feed)
        return await self.service.get(feed.id)

    async def sync(self, company_id, property_id, feed_id):
        await self.service.read(await self.service.get_own(company_id, property_id, feed_id))

    async def remove(self, company_id, property_id, feed_id):
        await self.service.remove(company_id, property_id, feed_id)

    async def list(self, company_id, property_id):
        return await self.service.list(company_id, property_id)

    async def blocks(self, prop):
        found = await self.bookings.list_blocks(prop.id, date(2030, 1, 1), date(2031, 12, 31))
        return sorted((b.start_date, b.end_date, b.reason, b.external_uid) for b in found)


class FakeCalendarFeedRepository:
    def __init__(self, bookings):
        self._feeds = {}
        self._bookings = bookings

    async def add(self, feed):
        self._feeds[feed.id] = feed
        return feed

    async def get(self, feed_id):
        return self._feeds.get(feed_id)

    async def list_for_property(self, property_id):
        return [f for f in self._feeds.values() if f.property_id == property_id]

    async def list_all(self):
        return list(self._feeds.values())

    async def delete(self, feed_id):
        # With its blocks, as the SQL one.
        for block in await self._bookings.list_feed_blocks(feed_id):
            await self._bookings.delete_block(block.id)
        self._feeds.pop(feed_id, None)

    async def record_sync(self, feed_id, synced_at, error):
        feed = self._feeds[feed_id]
        feed.last_synced_at, feed.last_error = synced_at, error


async def test_a_platforms_nights_close_the_flat_and_follow_its_calendar():
    f = Feeds()
    prop = await f.flat()
    feed = await f.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    assert feed.last_error is None and feed.last_synced_at is not None
    assert await f.blocks(prop) == [
        (date(2030, 10, 10), date(2030, 10, 12), "Airbnb", "1418fb94e984-ac2b0aa6c5c0aaca@airbnb.com"),
        (date(2030, 10, 20), date(2030, 10, 21), "Airbnb", "7f662ec65913-a3f9@airbnb.com"),
    ]
    with pytest.raises(PropertyBlockedError):
        await f.book(prop, datetime(2030, 10, 11, 14), datetime(2030, 10, 12, 12))

    # There, the guest stayed a night longer, and the other stay was cancelled.
    first_only = AIRBNB.split("BEGIN:VEVENT\r\nDTEND;VALUE=DATE:20301021")[0] + "END:VCALENDAR\r\n"
    f.text = first_only.replace("20301012", "20301013")
    await f.sync(COMPANY_ID, prop.id, feed.id)
    assert await f.blocks(prop) == [
        (date(2030, 10, 10), date(2030, 10, 13), "Airbnb", "1418fb94e984-ac2b0aa6c5c0aaca@airbnb.com"),
    ]
    await f.book(prop, datetime(2030, 10, 20, 14), datetime(2030, 10, 21, 12))

    # Nothing changed there: the block stays as it is.
    window = (prop.id, date(2030, 1, 1), date(2031, 1, 1))
    before = (await f.bookings.list_blocks(*window))[0].id
    await f.sync(COMPANY_ID, prop.id, feed.id)
    assert (await f.bookings.list_blocks(*window))[0].id == before


async def test_a_calendar_that_cannot_be_read_changes_nothing():
    f = Feeds()
    prop = await f.flat()
    feed = await f.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    f.text = FeedError("HTTP 503")
    await f.sync(COMPANY_ID, prop.id, feed.id)
    assert feed.last_error == "HTTP 503"
    assert len(await f.blocks(prop)) == 2


async def test_a_calendar_cut_short_changes_nothing():
    f = Feeds()
    prop = await f.flat()
    feed = await f.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    f.text = AIRBNB[: AIRBNB.index("BEGIN:VEVENT", AIRBNB.index("END:VEVENT"))]
    await f.sync(COMPANY_ID, prop.id, feed.id)
    assert "cut short" in feed.last_error
    assert len(await f.blocks(prop)) == 2


async def test_past_nights_are_not_taken():
    f = Feeds(today=date(2030, 10, 15))
    prop = await f.flat()
    await f.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    assert [b[0] for b in await f.blocks(prop)] == [date(2030, 10, 20)]


async def test_a_double_sale_is_kept_and_told_once():
    f = Feeds()
    prop = await f.flat()
    await f.book(prop, datetime(2030, 10, 11, 14), datetime(2030, 10, 13, 12))
    feed = await f.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    assert f.clashes == [[(date(2030, 10, 10), date(2030, 10, 12))]]
    assert len(await f.blocks(prop)) == 2
    await f.sync(COMPANY_ID, prop.id, feed.id)
    assert len(f.clashes) == 1


async def test_the_platforms_own_booking_in_day_is_the_same_stay():
    # The owner (or the CRM) books the Airbnb guest in Day too: the calendar's event
    # for that stay is that booking, not a double sale, and it closes no other night.
    f = Feeds()
    prop = await f.flat()
    await f.book(prop, datetime(2030, 10, 10, 14), datetime(2030, 10, 12, 12), source=BookingSource.AIRBNB)
    await f.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    assert [b[0] for b in await f.blocks(prop)] == [date(2030, 10, 20)]
    assert f.clashes == []
    # Read first, booked after: the platform's own booking is not refused by its block,
    # and the next read leaves those nights to it.
    feed = (await f.list(COMPANY_ID, prop.id))[0]
    # Another platform's guest on those nights is refused...
    with pytest.raises(PropertyBlockedError):
        await f.book(prop, datetime(2030, 10, 20, 14), datetime(2030, 10, 21, 12), source=BookingSource.BOOKING)
    # ...Airbnb's own is not.
    await f.book(prop, datetime(2030, 10, 20, 14), datetime(2030, 10, 21, 12), source=BookingSource.AIRBNB)
    await f.sync(COMPANY_ID, prop.id, feed.id)
    assert await f.blocks(prop) == []


async def test_nights_a_platform_only_marks_unavailable_close_but_are_no_double_sale():
    # Airbnb gives back as "Not available" the nights it closed from Day's own link:
    # over a Day booking that is the booking's echo, not a second guest.
    f = Feeds()
    prop = await f.flat()
    await f.book(prop, datetime(2030, 10, 20, 14), datetime(2030, 10, 21, 12))
    await f.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    blocks = await f.bookings.list_blocks(prop.id, date(2030, 1, 1), date(2031, 1, 1))
    assert sorted((b.start_date, b.reserved) for b in blocks) == [
        (date(2030, 10, 10), True),
        (date(2030, 10, 20), False),
    ]
    assert f.clashes == []


async def test_a_double_sale_is_told_once_even_when_the_platform_renews_its_ids():
    f = Feeds()
    prop = await f.flat()
    await f.book(prop, datetime(2030, 10, 11, 14), datetime(2030, 10, 13, 12))
    feed = await f.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    assert len(f.clashes) == 1
    f.text = AIRBNB.replace("1418fb94e984-ac2b0aa6c5c0aaca", "renewed-id")
    await f.sync(COMPANY_ID, prop.id, feed.id)
    assert len(f.clashes) == 1


async def test_a_stay_leaving_today_keeps_its_nights_closed():
    f = Feeds(today=date(2030, 10, 12))
    prop = await f.flat()
    await f.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    assert [b[0] for b in await f.blocks(prop)] == [date(2030, 10, 10), date(2030, 10, 20)]


async def test_a_calendars_block_is_not_removed_by_hand():
    f = Feeds()
    prop = await f.flat()
    await f.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    block = (await f.bookings.list_blocks(prop.id, date(2030, 1, 1), date(2031, 1, 1)))[0]
    with pytest.raises(BlockFromCalendarError):
        await ManageBlocksService(f.bookings, f.props).delete(COMPANY_ID, prop.id, block.id)


async def test_a_calendar_belongs_to_the_companys_own_flat_and_goes_with_its_nights():
    f = Feeds()
    prop = await f.flat()
    with pytest.raises(ValueError, match="Property not found"):
        await f.add(uuid.uuid4(), prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    feed = await f.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    with pytest.raises(ValueError, match="Property not found"):
        await f.remove(uuid.uuid4(), prop.id, feed.id)
    # Through another flat of the company: not that flat's calendar.
    other = await f.flat()
    with pytest.raises(ValueError, match="Calendar not found"):
        await f.remove(COMPANY_ID, other.id, feed.id)
    await f.remove(COMPANY_ID, prop.id, feed.id)
    assert await f.blocks(prop) == []
    assert await f.list(COMPANY_ID, prop.id) == []


async def test_only_public_addresses_are_fetched(monkeypatch):
    import socket

    from app.infrastructure import calendar_fetch

    with pytest.raises(FeedError, match="http"):
        await calendar_fetch.fetch_calendar("ftp://example.com/a.ics")

    async def resolve(host, port, **_):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", port))]

    monkeypatch.setattr(calendar_fetch, "_resolve", resolve)
    with pytest.raises(FeedError, match="address"):
        await calendar_fetch.fetch_calendar("https://calendar.internal/a.ics")
    with pytest.raises(FeedError, match="address"):
        await calendar_fetch.fetch_calendar("http://127.0.0.1:8000/api/v1/health")


@pytest.mark.integration
async def test_calendars_through_the_api(flat, monkeypatch):  # noqa: F811  (the imported fixture)
    from app.presentation.api.v1 import properties

    async def fetch(url):
        return AIRBNB

    monkeypatch.setattr(properties, "fetch_calendar", fetch)
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}/calendar-feeds"
    body = {"name": "Airbnb", "url": "https://www.airbnb.com/calendar/ical/1.ics?s=secret"}

    use(Permission.PROPERTIES_READ)
    assert (await client.post(path, json=body)).status_code == 403
    assert (await client.get(path)).status_code == 403

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE, Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE)
    created = await client.post(path, json=body)
    assert created.status_code == 201, created.text
    feed = created.json()
    assert feed["name"] == "Airbnb" and feed["last_error"] is None and feed["last_synced_at"]
    # Day's link for Airbnb itself leaves out what came from Airbnb.
    assert f"/api/v1/calendar/{prop}.ics?token=" in feed["export_url"]
    assert feed["export_url"].endswith(f"&exclude={feed['id']}")
    assert (await client.post(path, json={**body, "url": "file:///etc/passwd"})).status_code == 422

    window = {"date_from": "2030-10-01", "date_to": "2030-11-01"}
    blocks = (await client.get(f"/api/v1/properties/{prop}/blocks", params=window)).json()
    assert [(b["start_date"], b["reason"], b["source"]) for b in blocks] == [
        ("2030-10-10", "Airbnb", "airbnb"),
        ("2030-10-20", "Airbnb", "airbnb"),
    ]
    refused = await client.delete(f"/api/v1/properties/{prop}/blocks/{blocks[0]['id']}")
    assert refused.status_code == 409, refused.text

    synced = await client.post(f"{path}/{feed['id']}/sync")
    assert synced.status_code == 200, synced.text
    assert [f["id"] for f in (await client.get(path)).json()] == [feed["id"]]
    assert (await client.get(f"/api/v1/properties/{uuid.uuid4()}/calendar-feeds")).status_code == 404

    assert (await client.delete(f"{path}/{feed['id']}")).status_code == 204
    assert (await client.get(f"/api/v1/properties/{prop}/blocks", params=window)).json() == []


def test_the_clash_notice_names_the_flat_the_calendar_and_the_nights():
    from app.application.messaging.notifications import render
    from app.domain.messaging.value_objects import NotificationEvent

    text = render(
        NotificationEvent.CALENDAR_CLASH,
        {"property_name": "Студия 28auc", "feed_name": "Airbnb", "nights": "10.10.2030 — 12.10.2030"},
    )
    assert "Студия 28auc" in text and "Airbnb" in text and "10.10.2030 — 12.10.2030" in text


# ---------- reading a link ----------


def _answering(handler):
    """fetch_calendar against a fake server: the address resolves to a public IP."""
    import socket

    import httpx

    from app.infrastructure import calendar_fetch

    async def resolve(host, port, **_):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))]

    def client(**kwargs):
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), **kwargs)

    return calendar_fetch, resolve, client


async def test_the_link_is_read_from_the_address_that_was_checked(monkeypatch):
    # The name is resolved once: the request goes to that very address, so a name
    # that answers with a private one the second time (DNS rebinding) gets nowhere.
    import httpx

    seen = {}

    def handler(request: httpx.Request):
        seen.update(host=request.url.host, header=request.headers["host"], sni=request.extensions.get("sni_hostname"))
        return httpx.Response(200, text=AIRBNB)

    fetch, resolve, client = _answering(handler)
    monkeypatch.setattr(fetch, "_resolve", resolve)
    monkeypatch.setattr(fetch, "_client", client)
    assert "BEGIN:VCALENDAR" in await fetch.fetch_calendar("https://www.airbnb.com/calendar/ical/1.ics?s=x")
    assert seen == {"host": "93.184.216.34", "header": "www.airbnb.com", "sni": "www.airbnb.com"}


@pytest.mark.parametrize(
    "answer, error",
    [
        ({"status_code": 302, "headers": {"location": "http://10.0.0.1/"}}, "HTTP 302"),
        ({"status_code": 200, "content": b"x" * (2 * 1024 * 1024 + 1)}, "too large"),
        ({"status_code": 200, "headers": {"content-encoding": "gzip"}, "content": b"\x1f\x8b"}, "compressed"),
    ],
)
async def test_a_link_that_answers_badly_is_refused(monkeypatch, answer, error):
    import httpx

    fetch, resolve, client = _answering(lambda request: httpx.Response(**answer))
    monkeypatch.setattr(fetch, "_resolve", resolve)
    monkeypatch.setattr(fetch, "_client", client)
    with pytest.raises(FeedError, match=error):
        await fetch.fetch_calendar("https://example.com/a.ics")


async def test_a_link_that_answers_too_slowly_is_given_up(monkeypatch):
    # One byte every few seconds would hold the read for hours: the whole read has a deadline.
    import asyncio

    import httpx

    async def slow(request):
        await asyncio.sleep(5)
        return httpx.Response(200, text=AIRBNB)

    fetch, resolve, client = _answering(slow)
    monkeypatch.setattr(fetch, "_resolve", resolve)
    monkeypatch.setattr(fetch, "_client", client)
    monkeypatch.setattr(fetch, "TOTAL_SECONDS", 0.2)
    with pytest.raises(FeedError, match="in time"):
        await fetch.fetch_calendar("https://example.com/a.ics")
    with pytest.raises(FeedError):
        await fetch.fetch_calendar("https://example.com:99999/a.ics")


async def test_the_chessboard_marks_only_a_platforms_booking_over_a_day_booking():
    from unittest.mock import AsyncMock

    from app.application.booking.get_gantt_data import GetGanttDataService
    from app.domain.booking.entities import Booking, PropertyBlock
    from app.domain.property.entities import Property
    from app.domain.property.value_objects import PropertyStatus, PropertyType

    apartment = Property(id=uuid.uuid4(), company_id=COMPANY_ID, name="Студия", internal_name="62auc",
                         type=PropertyType.APARTMENT, status=PropertyStatus.ACTIVE)
    stay = Booking(company_id=COMPANY_ID, property_id=apartment.id, check_in=datetime(2030, 10, 11, 14),
                   check_out=datetime(2030, 10, 13, 12), source=BookingSource.DIRECT)

    def block(start, reserved):
        return PropertyBlock(
            company_id=COMPANY_ID, property_id=apartment.id,
            start_date=date(2030, 10, start), end_date=date(2030, 10, start + 2),
            starts_at=datetime(2030, 10, start, 12), ends_at=datetime(2030, 10, start + 2, 12),
            reason="Airbnb", feed_id=uuid.uuid4(), source="airbnb", reserved=reserved,
        )

    sold, echo = block(10, True), block(12, False)
    properties, bookings, guests, prices = AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    properties.list_by_company.return_value = [apartment]
    bookings.list_by_property_date_range.return_value = [stay]
    bookings.list_company_blocks.return_value = [sold, echo]
    guests.get_by_id.return_value = None
    prices.list_for_company.return_value = []
    data = await GetGanttDataService(properties, bookings, guests, prices).execute(  # type: ignore[arg-type]
        COMPANY_ID, date(2030, 10, 1), date(2030, 11, 1)
    )
    assert [(b.start_date, b.clash) for b in data.properties[0].blocks] == [
        (date(2030, 10, 10), True),
        (date(2030, 10, 12), False),
    ]

