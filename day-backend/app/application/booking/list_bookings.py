from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from app.domain.booking.entities import Booking
from app.domain.booking.repositories import BookingRepository
from app.domain.booking.value_objects import BookingSource, BookingStatus


@dataclass
class BookingListResult:
    items: list[Booking]
    total: int
    offset: int
    limit: int


class ListBookingsService:
    def __init__(self, booking_repo: BookingRepository) -> None:
        self._booking_repo = booking_repo

    async def execute(
        self,
        company_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
        status: BookingStatus | None = None,
        property_id: uuid.UUID | None = None,
        source: BookingSource | None = None,
        search: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> BookingListResult:
        items = await self._booking_repo.list_by_company(
            company_id,
            offset=offset,
            limit=limit,
            status=status,
            property_id=property_id,
            source=source,
            search=search,
            date_from=date_from,
            date_to=date_to,
        )
        total = await self._booking_repo.count_by_company(
            company_id,
            status=status,
            property_id=property_id,
            source=source,
            search=search,
            date_from=date_from,
            date_to=date_to,
        )
        return BookingListResult(items=items, total=total, offset=offset, limit=limit)
