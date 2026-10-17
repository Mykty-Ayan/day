"""Platforms' iCal calendars (Airbnb, Booking.com, ...) read into Day.

Each event closes the flat's nights with a block, as a booking elsewhere would:
nothing is booked over it. The calendar keeps its blocks: a moved event moves
its block, a removed one frees the nights. A block that lands on a Day booking
is a double sale; it stays (the night is sold there too) and the owner is told.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from app.application.booking.blocks import block_span, checkout_hour
from app.domain.booking.entities import CalendarFeed, PropertyBlock
from app.domain.booking.repositories import BookingRepository, CalendarFeedRepository
from app.domain.property.repositories import PropertyRepository


class FeedError(ValueError):
    """The calendar could not be read: the link, the address or its content."""


@dataclass(frozen=True)
class FeedEvent:
    uid: str
    start: date
    end: date


_DATE = re.compile(r"^(\d{4})(\d{2})(\d{2})")


def _date(value: str) -> date | None:
    # 20301010 (a whole day) or 20301010T140000[Z]: the day is what counts.
    found = _DATE.match(value.strip())
    return date(int(found[1]), int(found[2]), int(found[3])) if found else None


def parse_events(text: str) -> list[FeedEvent]:
    """The calendar's events as nights [start, end). Lenient as the platforms are:
    no DTSTAMP (Booking.com), no DTEND (one night), folded lines."""
    if "BEGIN:VCALENDAR" not in text:
        raise FeedError("Not an iCal calendar")
    lines: list[str] = []
    for raw in re.split(r"\r\n|\n|\r", text):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)

    events: list[FeedEvent] = []
    current: dict[str, str] | None = None
    for line in lines:
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT" and current is not None:
            start = _date(current.get("DTSTART", ""))
            end = _date(current.get("DTEND", "")) if "DTEND" in current else None
            if start and current.get("STATUS", "").upper() != "CANCELLED":
                end = end if end and end > start else start + timedelta(days=1)
                events.append(FeedEvent(current.get("UID") or f"{start}-{end}", start, end))
            current = None
        elif current is not None and ":" in line:
            name, value = line.split(":", 1)
            current[name.split(";", 1)[0].upper()] = value.strip()
    return events


Notify = Callable[[CalendarFeed, object, list[PropertyBlock]], Awaitable[None]]


class CalendarFeedsService:
    def __init__(
        self,
        feed_repo: CalendarFeedRepository,
        booking_repo: BookingRepository,
        property_repo: PropertyRepository,
        fetch: Callable[[str], Awaitable[str]],
        notify: Notify,
        *,
        today: Callable[[], date] = date.today,
    ) -> None:
        self._feeds = feed_repo
        self._bookings = booking_repo
        self._properties = property_repo
        self._fetch = fetch
        self._notify = notify
        self._today = today

    async def _own(self, company_id: uuid.UUID, property_id: uuid.UUID):
        prop = await self._properties.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")
        return prop

    async def _own_feed(self, company_id: uuid.UUID, property_id: uuid.UUID, feed_id: uuid.UUID) -> CalendarFeed:
        await self._own(company_id, property_id)
        feed = await self._feeds.get(feed_id)
        if feed is None or feed.property_id != property_id:
            raise ValueError("Calendar not found")
        return feed

    async def list(self, company_id: uuid.UUID, property_id: uuid.UUID) -> list[CalendarFeed]:
        await self._own(company_id, property_id)
        return await self._feeds.list_for_property(property_id)

    async def add(self, company_id: uuid.UUID, property_id: uuid.UUID, name: str, url: str) -> CalendarFeed:
        """Add the calendar and read it at once; a read that fails is kept in last_error."""
        await self._own(company_id, property_id)
        feed = await self._feeds.add(CalendarFeed(company_id=company_id, property_id=property_id, name=name, url=url))
        return await self.sync(company_id, property_id, feed.id)

    async def remove(self, company_id: uuid.UUID, property_id: uuid.UUID, feed_id: uuid.UUID) -> None:
        """The calendar goes with its blocks: those nights are free again."""
        await self._own_feed(company_id, property_id, feed_id)
        await self._feeds.delete(feed_id)

    async def sync(self, company_id: uuid.UUID, property_id: uuid.UUID, feed_id: uuid.UUID) -> CalendarFeed:
        await self.read(await self._own_feed(company_id, property_id, feed_id))
        return await self._feeds.get(feed_id)

    async def read(self, feed: CalendarFeed) -> None:
        """Bring the feed's blocks in line with its calendar. For the timer, which reads
        every company's calendars: no owner check here."""
        now = datetime.utcnow()
        try:
            events = parse_events(await self._fetch(feed.url))
        except FeedError as error:
            # Nothing changes on a calendar that cannot be read: its nights stay closed.
            await self._feeds.record_sync(feed.id, now, str(error)[:500])
            return

        prop = await self._properties.get_by_id(feed.property_id)
        hour = checkout_hour(prop)
        # Past nights matter to nobody; the platforms drop them too.
        wanted = {event.uid: event for event in events if event.end > self._today()}
        # Under the calendar lock: a booking made at the same moment waits and sees the block.
        await self._bookings.lock_property_calendar(feed.property_id)
        held = {block.external_uid: block for block in await self._bookings.list_feed_blocks(feed.id)}

        new: list[PropertyBlock] = []
        for uid, event in wanted.items():
            block = held.get(uid)
            if block is not None and (block.start_date, block.end_date) == (event.start, event.end):
                continue
            if block is not None:
                await self._bookings.delete_block(block.id)
            starts_at, ends_at = block_span(event.start, event.end, hour)
            new.append(
                await self._bookings.add_block(
                    PropertyBlock(
                        company_id=feed.company_id,
                        property_id=feed.property_id,
                        start_date=event.start,
                        end_date=event.end,
                        starts_at=starts_at,
                        ends_at=ends_at,
                        reason=feed.name,
                        feed_id=feed.id,
                        external_uid=uid,
                    )
                )
            )
        for uid, block in held.items():
            if uid not in wanted:
                await self._bookings.delete_block(block.id)

        # A new or moved block over a Day booking is a double sale: told once, when it appears.
        clashes = [
            block
            for block in new
            if await self._bookings.get_by_property_and_dates(feed.property_id, block.starts_at, block.ends_at)
        ]
        if clashes:
            await self._notify(feed, prop, clashes)
        await self._feeds.record_sync(feed.id, now, None)
