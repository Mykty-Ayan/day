"""The public iCal feed of a flat. No sign-in: Airbnb and Booking.com fetch it by link."""

from __future__ import annotations

import hmac
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.booking.ical_export import blocked_nights, render_calendar
from app.config import settings
from app.infrastructure.database import get_session
from app.infrastructure.repositories.booking import SqlBookingRepository
from app.infrastructure.repositories.property import SqlPropertyRepository
from app.infrastructure.security import calendar_token

ical_router = APIRouter(prefix="/calendar", tags=["calendar"])

# Airbnb imports up to two years ahead; a booking past the feed's end could be sold again.
_HORIZON_DAYS = 3 * 366


def _repos(session: AsyncSession):
    return SqlPropertyRepository(session), SqlBookingRepository(session)


@ical_router.get("/{property_id}.ics", include_in_schema=False)
async def property_calendar(
    property_id: uuid.UUID,
    token: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    # The same answer for a wrong token and a missing flat: the link is the key.
    # As bytes: compare_digest refuses a str with non-ASCII characters (a 500, not a 404).
    if not hmac.compare_digest(token.encode(), calendar_token(property_id).encode()):
        raise HTTPException(status_code=404, detail="Not found")
    properties, bookings = _repos(session)
    prop = await properties.get_by_id(property_id)
    if prop is None:
        raise HTTPException(status_code=404, detail="Not found")

    today = date.today()
    found = await bookings.get_by_property_and_dates(
        property_id, today - timedelta(days=1), today + timedelta(days=_HORIZON_DAYS)
    )
    closed = await bookings.list_blocks(property_id, today - timedelta(days=1), today + timedelta(days=_HORIZON_DAYS))
    # Of a platform's calendar only its bookings go on: nights it merely marks
    # unavailable may be another platform's echo, and passing them on would keep
    # both platforms closed after the guest cancels.
    closed = [block for block in closed if block.feed_id is None or block.reserved]
    # Nights by the flat's own hours, else the company default.
    ranges = blocked_nights(
        found,
        settings.DEFAULT_CHECK_IN_HOUR if prop.check_in_hour is None else prop.check_in_hour,
        settings.DEFAULT_CHECK_OUT_HOUR if prop.check_out_hour is None else prop.check_out_hour,
        blocks=closed,
    )
    body = render_calendar(property_id, ranges, stamp=datetime.now(timezone.utc))
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={"Cache-Control": "no-cache"},
    )
