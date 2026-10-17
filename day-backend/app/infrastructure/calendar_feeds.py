"""Wiring of the platforms' calendars, shared by the API and the timer."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.booking.calendar_feeds import CalendarFeedsService
from app.domain.messaging.value_objects import NotificationEvent
from app.infrastructure.calendar_fetch import fetch_calendar
from app.infrastructure.messaging.factory import build_notification_service
from app.infrastructure.repositories.booking import SqlBookingRepository, SqlCalendarFeedRepository
from app.infrastructure.repositories.property import SqlPropertyRepository


def build_calendar_feeds(
    session: AsyncSession, fetch: Callable[[str], Awaitable[str]] = fetch_calendar
) -> CalendarFeedsService:
    async def notify(feed, prop, clashes) -> None:
        # In the same transaction as the blocks: told if and only if they are kept.
        nights = ", ".join(f"{b.start_date:%d.%m.%Y} — {b.end_date:%d.%m.%Y}" for b in clashes)
        await build_notification_service(session).notify_company(
            feed.company_id,
            NotificationEvent.CALENDAR_CLASH,
            {"property_name": prop.name if prop else "—", "feed_name": feed.name, "nights": nights},
        )

    return CalendarFeedsService(
        SqlCalendarFeedRepository(session), SqlBookingRepository(session), SqlPropertyRepository(session), fetch, notify
    )
