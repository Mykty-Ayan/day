"""The booking change feed that integrations poll.

A poller keeps the position of the last change it saw and asks for what came
after it. The position is (updated_at, id): updated_at alone is not unique, and
two bookings changed in the same microsecond must not hide one another.
"""

from __future__ import annotations

import base64
import binascii
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.domain.booking.entities import Booking
from app.domain.booking.repositories import BookingRepository

# updated_at is stamped when the UPDATE runs, not when its transaction commits.
# A transaction still open when the poller reads would commit behind a cursor
# that has already moved past it, and the change would be lost. So the feed
# only shows changes older than the longest write transaction: a Channex
# webhook waits on Channex for up to 20 s before it commits.
FEED_SETTLE = timedelta(seconds=30)

_START = datetime(1970, 1, 1)


@dataclass(frozen=True)
class FeedPosition:
    updated_at: datetime
    booking_id: uuid.UUID

    @classmethod
    def start(cls) -> FeedPosition:
        return cls(_START, uuid.UUID(int=0))

    @classmethod
    def since(cls, updated_at: datetime) -> FeedPosition:
        """Just before every change at or after `updated_at`."""
        return cls(updated_at, uuid.UUID(int=0))

    def encode(self) -> str:
        raw = f"{self.updated_at.isoformat()}|{self.booking_id}".encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    @classmethod
    def decode(cls, cursor: str) -> FeedPosition:
        try:
            padded = cursor + "=" * (-len(cursor) % 4)
            stamp, booking_id = base64.urlsafe_b64decode(padded.encode()).decode().split("|")
            return cls(datetime.fromisoformat(stamp), uuid.UUID(booking_id))
        except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
            raise ValueError("Invalid cursor") from exc

    def as_tuple(self) -> tuple[datetime, uuid.UUID]:
        return (self.updated_at, self.booking_id)


@dataclass
class BookingFeedPage:
    items: list[Booking]
    # Where to resume. Present even for an empty page, so a poller always has
    # something to store.
    next_position: FeedPosition
    has_more: bool


class BookingFeedService:
    def __init__(self, booking_repo: BookingRepository) -> None:
        self._booking_repo = booking_repo

    async def execute(
        self,
        company_id: uuid.UUID,
        *,
        after: FeedPosition | None,
        limit: int,
        now: datetime,
    ) -> BookingFeedPage:
        position = after or FeedPosition.start()
        rows = await self._booking_repo.list_changed(
            company_id,
            after=position.as_tuple(),
            until=now - FEED_SETTLE,
            limit=limit + 1,
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        if rows:
            position = FeedPosition(rows[-1].updated_at, rows[-1].id)
        return BookingFeedPage(items=rows, next_position=position, has_more=has_more)
