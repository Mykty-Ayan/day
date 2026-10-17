"""Background read of the platforms' iCal calendars.

Runs inside the API process on a timer, like the hold sweep. Each calendar is
read in its own session and transaction: one that fails or hangs does not hold
the others. A calendar read lately (by another API instance, or by the owner's
"sync now") is left for the next turn. Airbnb reads other calendars about every
three hours; half an hour keeps Day ahead of it.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.infrastructure.calendar_feeds import build_calendar_feeds
from app.infrastructure.calendar_fetch import fetch_calendar
from app.infrastructure.database import async_session
from app.infrastructure.repositories.booking import SqlCalendarFeedRepository

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 30 * 60
FRESH = timedelta(minutes=25)


async def run_once(maker: async_sessionmaker[AsyncSession] = async_session) -> int:
    async with maker() as session:
        feeds = await SqlCalendarFeedRepository(session).list_all()
    read = 0
    for listed in feeds:
        try:
            # Looked at again just before: the owner or another instance may have read
            # it since the list was taken, or the owner removed it.
            async with maker() as session:
                feed = await SqlCalendarFeedRepository(session).get(listed.id)
            if feed is None or (feed.last_synced_at and datetime.utcnow() - feed.last_synced_at < FRESH):
                continue
            async with maker() as session:
                calendars = build_calendar_feeds(session, fetch_calendar)
                # Read before the session touches the database: a slow platform holds no connection.
                loaded = await calendars.load(feed)
                await calendars.apply(feed, loaded)
                await session.commit()
            read += 1
        except Exception:
            # The calendar keeps its blocks; the next turn tries again.
            logger.exception("Calendar %s could not be read", listed.id)
    return read


async def calendar_worker(stop: asyncio.Event) -> None:
    logger.info("Calendar reader started")
    while not stop.is_set():
        try:
            read = await run_once()
            if read:
                logger.info("Read %d platform calendar(s)", read)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Calendar read pass failed")

        try:
            await asyncio.wait_for(stop.wait(), timeout=POLL_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            continue

    logger.info("Calendar reader stopped")
