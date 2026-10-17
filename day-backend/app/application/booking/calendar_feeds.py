"""Platforms' iCal calendars (Airbnb, Booking.com, ...) read into Day.

Each event closes the flat's nights with a block, as a booking elsewhere would:
nothing is booked over it. The calendar keeps its blocks: a moved event moves
its block, a removed one frees the nights.

Three cases are told apart, as channel managers do:
- the platform's own booking already in Day (same platform, same nights): that
  booking closes the nights, no block and no alarm;
- a booking on the platform over another Day booking: a double sale, kept (the
  night is sold there) and told to the owner once;
- nights the platform only marks unavailable ("Airbnb (Not available)"): they
  close the nights, but may be the echo of Day's own link, so they are no
  double sale and are not passed on to the other platforms.

Reading a link is kept apart from the database (load, then apply), so a slow
platform holds no connection.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from urllib.parse import urlsplit

from app.application.booking.blocks import block_span, checkout_hour
from app.domain.booking.entities import CalendarFeed, PropertyBlock
from app.domain.booking.repositories import BookingRepository, CalendarFeedRepository
from app.domain.booking.value_objects import BookingSource
from app.domain.property.repositories import PropertyRepository


class FeedError(ValueError):
    """The calendar could not be read: the link, the address or its content."""


@dataclass(frozen=True)
class FeedEvent:
    uid: str
    start: date
    end: date
    summary: str = ""


_DATE = re.compile(r"^(\d{4})(\d{2})(\d{2})")
_DURATION = re.compile(r"^P(?:(\d+)W)?(?:(\d+)D)?", re.IGNORECASE)


def _date(value: str) -> date:
    # 20301010 (a whole day) or 20301010T140000[Z]: the day is what counts.
    found = _DATE.match(value.strip())
    if not found:
        raise FeedError("An event has no start date")
    try:
        return date(int(found[1]), int(found[2]), int(found[3]))
    except ValueError:
        raise FeedError(f"An event has a wrong date: {value.strip()[:20]}")


def _end(start: date, fields: dict[str, str]) -> date:
    try:
        if "DTEND" in fields:
            end = _date(fields["DTEND"])
            if end > start:
                return end
        found = _DURATION.match(fields.get("DURATION", ""))
        days = (int(found[1] or 0) * 7 + int(found[2] or 0)) if found else 0
        return start + timedelta(days=max(days, 1))
    except OverflowError:
        raise FeedError("An event ends past the calendar's end")


def _uid(raw: str, start: date, seen: set[str]) -> str:
    # Kept short for the index; a UID used twice (some platforms do) is told apart by its day.
    uid = raw if len(raw) <= 200 else hashlib.sha256(raw.encode()).hexdigest()
    return f"{uid[:180]}#{start:%Y%m%d}" if uid in seen else uid


def parse_events(text: str) -> list[FeedEvent]:
    """The calendar's events as nights [start, end). Lenient as the platforms are
    (no DTSTAMP, an end by DTEND or DURATION or none, folded lines, any case),
    strict where a night would be lost: an event it cannot place is an error."""
    if "BEGIN:VCALENDAR" not in text.upper():
        raise FeedError("Not an iCal calendar")
    lines: list[str] = []
    for raw in re.split(r"\r\n|\n|\r", text):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)

    events: list[FeedEvent] = []
    seen: set[str] = set()
    current: dict[str, str] | None = None
    for line in lines:
        mark = line.strip().upper()
        if mark == "BEGIN:VEVENT":
            current = {}
        elif mark == "END:VEVENT" and current is not None:
            if current.get("STATUS", "").upper() != "CANCELLED":
                start = _date(current.get("DTSTART", ""))
                end = _end(start, current)
                uid = _uid(current.get("UID") or f"{start}-{end}", start, seen)
                seen.add(uid)
                events.append(FeedEvent(uid, start, end, current.get("SUMMARY", "")))
            current = None
        elif current is not None and ":" in line:
            name, value = line.split(":", 1)
            current[name.split(";", 1)[0].strip().upper()] = value.strip()
    return events


def feed_source(url: str) -> str | None:
    """The platform by the link's address, as Day's bookings name it."""
    host = (urlsplit(url).hostname or "").lower()
    if re.search(r"(^|\.)airbnb\.[a-z.]+$", host):
        return BookingSource.AIRBNB.value
    if host == "booking.com" or host.endswith(".booking.com"):
        return BookingSource.BOOKING.value
    return None


def is_booking(source: str | None, summary: str) -> bool:
    """A booking on the platform, not nights it only marks unavailable. Booking.com
    calls its bookings "CLOSED - Not available" (and exports only bookings when set
    to "booked dates only"); the others say "Not available" or "Blocked" for a mere
    closure, which may be the echo of Day's own link."""
    if source == BookingSource.BOOKING.value:
        return True
    return not re.search(r"not available|unavailable|blocked", summary, re.IGNORECASE)


Loaded = list[FeedEvent] | FeedError
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

    async def get_own(self, company_id: uuid.UUID, property_id: uuid.UUID, feed_id: uuid.UUID) -> CalendarFeed:
        await self._own(company_id, property_id)
        feed = await self._feeds.get(feed_id)
        if feed is None or feed.property_id != property_id:
            raise ValueError("Calendar not found")
        return feed

    async def get(self, feed_id: uuid.UUID) -> CalendarFeed | None:
        return await self._feeds.get(feed_id)

    async def list(self, company_id: uuid.UUID, property_id: uuid.UUID) -> list[CalendarFeed]:
        await self._own(company_id, property_id)
        return await self._feeds.list_for_property(property_id)

    async def add(self, company_id: uuid.UUID, property_id: uuid.UUID, name: str, url: str) -> CalendarFeed:
        """Keep the calendar; reading it is load() and apply()."""
        await self._own(company_id, property_id)
        return await self._feeds.add(
            CalendarFeed(company_id=company_id, property_id=property_id, name=name, url=url, source=feed_source(url))
        )

    async def remove(self, company_id: uuid.UUID, property_id: uuid.UUID, feed_id: uuid.UUID) -> None:
        """The calendar goes with its blocks: those nights are free again."""
        await self.get_own(company_id, property_id, feed_id)
        await self._feeds.delete(feed_id)

    async def load(self, feed: CalendarFeed) -> Loaded:
        """Read the platform's calendar. No database here: a slow platform holds no connection."""
        try:
            return parse_events(await self._fetch(feed.url))
        except FeedError as error:
            return error

    async def read(self, feed: CalendarFeed) -> None:
        await self.apply(feed, await self.load(feed))

    async def apply(self, feed: CalendarFeed, loaded: Loaded) -> None:
        """Bring the calendar's blocks in line with what was read. No owner check:
        the API checks before reading, and the timer reads every company's."""
        now = datetime.utcnow()
        if await self._feeds.get(feed.id) is None:
            return  # removed while it was being read
        if isinstance(loaded, FeedError):
            # Nothing changes on a calendar that cannot be read: its nights stay closed.
            await self._feeds.record_sync(feed.id, now, str(loaded)[:500])
            return

        prop = await self._properties.get_by_id(feed.property_id)
        hour = checkout_hour(prop)
        # A stay leaving today keeps its nights until it has left; past ones matter to nobody.
        wanted = {event.uid: event for event in loaded if event.end >= self._today()}
        # Under the calendar lock: a booking made at the same moment waits and sees the block.
        await self._bookings.lock_property_calendar(feed.property_id)
        held = {block.external_uid: block for block in await self._bookings.list_feed_blocks(feed.id)}
        # Nights this calendar closed before: a double sale on them was told already, even
        # if the platform renamed the event since.
        told = {(block.start_date, block.end_date) for block in held.values() if block.reserved}

        clashes: list[PropertyBlock] = []
        for uid, event in wanted.items():
            starts_at, ends_at = block_span(event.start, event.end, hour)
            reserved = is_booking(feed.source, event.summary)
            booked = await self._bookings.get_by_property_and_dates(feed.property_id, starts_at, ends_at)
            block = held.get(uid)
            if feed.source and any(b.source.value == feed.source for b in booked):
                # The platform's own booking, booked in Day too: it closes the nights itself.
                if block is not None:
                    await self._bookings.delete_block(block.id)
                    del held[uid]
                continue
            if block is not None and (block.start_date, block.end_date, block.reserved) == (
                event.start,
                event.end,
                reserved,
            ):
                continue
            if block is not None:
                await self._bookings.delete_block(block.id)
            created = await self._bookings.add_block(
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
                    source=feed.source,
                    reserved=reserved,
                )
            )
            if reserved and booked and (event.start, event.end) not in told:
                clashes.append(created)
        for uid, block in held.items():
            if uid not in wanted:
                await self._bookings.delete_block(block.id)

        if clashes:
            await self._notify(feed, prop, clashes)
        await self._feeds.record_sync(feed.id, now, None)
