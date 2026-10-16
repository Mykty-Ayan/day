"""A flat's closed nights (blocks) against a stay."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from app.config import settings
from app.domain.booking.entities import PropertyBlock
from app.domain.booking.exceptions import PropertyBlockedError
from app.domain.booking.repositories import BookingRepository


def checkout_hour(prop) -> int:
    return settings.DEFAULT_CHECK_OUT_HOUR if prop.check_out_hour is None else prop.check_out_hour


def block_span(start_date: date, end_date: date, hour: int) -> tuple[datetime, datetime]:
    """From the check-out hour of the first night to that hour of the day after the
    last: the morning guest before and the guest arriving on end_date are untouched."""
    return datetime.combine(start_date, time(hour)), datetime.combine(end_date, time(hour))


def blocks_stay(blocks: list[PropertyBlock], hour: int, check_in: datetime, check_out: datetime) -> bool:
    for block in blocks:
        start, end = block_span(block.start_date, block.end_date, hour)
        if check_in < end and check_out > start:
            return True
    return False


async def ensure_not_blocked(booking_repo: BookingRepository, prop, check_in: datetime, check_out: datetime) -> None:
    """Refuse a stay on the flat's closed nights. Under the calendar lock, held to
    commit, so a block and a booking made at once cannot both get in."""
    await booking_repo.lock_property_calendar(prop.id)
    blocks = await booking_repo.list_blocks(
        prop.id, check_in.date() - timedelta(days=1), check_out.date() + timedelta(days=1)
    )
    if blocks_stay(blocks, checkout_hour(prop), check_in, check_out):
        raise PropertyBlockedError()
