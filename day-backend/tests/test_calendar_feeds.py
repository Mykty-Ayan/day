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

        self.feeds = CalendarFeedsService(
            FakeCalendarFeedRepository(self.bookings), self.bookings, self.props, fetch, notify, today=lambda: today
        )

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
    feed = await f.feeds.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
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
    await f.feeds.sync(COMPANY_ID, prop.id, feed.id)
    assert await f.blocks(prop) == [
        (date(2030, 10, 10), date(2030, 10, 13), "Airbnb", "1418fb94e984-ac2b0aa6c5c0aaca@airbnb.com"),
    ]
    await f.book(prop, datetime(2030, 10, 20, 14), datetime(2030, 10, 21, 12))

    # Nothing changed there: the block stays as it is.
    window = (prop.id, date(2030, 1, 1), date(2031, 1, 1))
    before = (await f.bookings.list_blocks(*window))[0].id
    await f.feeds.sync(COMPANY_ID, prop.id, feed.id)
    assert (await f.bookings.list_blocks(*window))[0].id == before


async def test_a_calendar_that_cannot_be_read_changes_nothing():
    f = Feeds()
    prop = await f.flat()
    feed = await f.feeds.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    f.text = FeedError("HTTP 503")
    await f.feeds.sync(COMPANY_ID, prop.id, feed.id)
    assert feed.last_error == "HTTP 503"
    assert len(await f.blocks(prop)) == 2


async def test_past_nights_are_not_taken():
    f = Feeds(today=date(2030, 10, 15))
    prop = await f.flat()
    await f.feeds.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    assert [b[0] for b in await f.blocks(prop)] == [date(2030, 10, 20)]


async def test_a_double_sale_is_kept_and_told_once():
    f = Feeds()
    prop = await f.flat()
    await f.book(prop, datetime(2030, 10, 11, 14), datetime(2030, 10, 13, 12))
    feed = await f.feeds.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    assert f.clashes == [[(date(2030, 10, 10), date(2030, 10, 12))]]
    assert len(await f.blocks(prop)) == 2
    await f.feeds.sync(COMPANY_ID, prop.id, feed.id)
    assert len(f.clashes) == 1


async def test_a_calendars_block_is_not_removed_by_hand():
    f = Feeds()
    prop = await f.flat()
    await f.feeds.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    block = (await f.bookings.list_blocks(prop.id, date(2030, 1, 1), date(2031, 1, 1)))[0]
    with pytest.raises(BlockFromCalendarError):
        await ManageBlocksService(f.bookings, f.props).delete(COMPANY_ID, prop.id, block.id)


async def test_a_calendar_belongs_to_the_companys_own_flat_and_goes_with_its_nights():
    f = Feeds()
    prop = await f.flat()
    with pytest.raises(ValueError, match="Property not found"):
        await f.feeds.add(uuid.uuid4(), prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    feed = await f.feeds.add(COMPANY_ID, prop.id, "Airbnb", "https://www.airbnb.com/calendar/ical/1.ics?s=x")
    with pytest.raises(ValueError, match="Property not found"):
        await f.feeds.remove(uuid.uuid4(), prop.id, feed.id)
    # Through another flat of the company: not that flat's calendar.
    other = await f.flat()
    with pytest.raises(ValueError, match="Calendar not found"):
        await f.feeds.remove(COMPANY_ID, other.id, feed.id)
    await f.feeds.remove(COMPANY_ID, prop.id, feed.id)
    assert await f.blocks(prop) == []
    assert await f.feeds.list(COMPANY_ID, prop.id) == []


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
    assert [(b["start_date"], b["reason"]) for b in blocks] == [("2030-10-10", "Airbnb"), ("2030-10-20", "Airbnb")]
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

