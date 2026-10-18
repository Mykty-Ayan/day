from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal

from app.domain.booking.repositories import BookingRepository, GuestRepository
from app.domain.booking.value_objects import BookingStatus
from app.domain.property.repositories import DayPriceRepository, PropertyRepository
from app.domain.property.value_objects import PropertyStatus


@dataclass
class GanttBooking:
    id: uuid.UUID
    guest_name: str
    check_in: datetime
    check_out: datetime
    rental_mode: str
    status: str
    source: str
    gantt_color: str
    gantt_icon: str | None
    adults_count: int
    children_count: int
    total_price: float
    overbooking: bool = False


@dataclass
class GanttBlock:
    """Nights the flat is closed without a booking: start_date the first, end_date the day after the last."""

    id: uuid.UUID
    start_date: date
    end_date: date
    reason: str | None
    # A platform's booking over a Day booking of another source: a double sale.
    clash: bool = False


@dataclass
class GanttDayPrice:
    """A night's price set on the calendar."""

    date: date
    price: Decimal


@dataclass
class GanttProperty:
    id: uuid.UUID
    name: str
    internal_name: str
    type: str
    status: str
    bookings: list[GanttBooking]
    blocks: list[GanttBlock] = field(default_factory=list)
    rental_mode: str = "daily"
    day_prices: list[GanttDayPrice] = field(default_factory=list)


@dataclass
class GanttData:
    properties: list[GanttProperty]


class GetGanttDataService:
    def __init__(
        self,
        property_repo: PropertyRepository,
        booking_repo: BookingRepository,
        guest_repo: GuestRepository,
        day_price_repo: DayPriceRepository,
    ) -> None:
        self._property_repo = property_repo
        self._booking_repo = booking_repo
        self._guest_repo = guest_repo
        self._day_price_repo = day_price_repo

    async def execute(
        self,
        company_id: uuid.UUID,
        start_date: date,
        end_date: date,
    ) -> GanttData:
        # Load all properties in batches to avoid truncating large portfolios.
        properties = []
        offset = 0
        batch_size = 200
        while True:
            batch = await self._property_repo.list_by_company(
                company_id,
                offset=offset,
                limit=batch_size,
            )
            if not batch:
                break
            properties.extend(batch)
            if len(batch) < batch_size:
                break
            offset += batch_size

        # One query for the whole board, not one a flat.
        closed: dict[uuid.UUID, list] = defaultdict(list)
        for block in await self._booking_repo.list_company_blocks(company_id, start_date, end_date):
            closed[block.property_id].append(block)
        priced: dict[uuid.UUID, list[GanttDayPrice]] = defaultdict(list)
        for night in await self._day_price_repo.list_for_company(company_id, start_date, end_date):
            priced[night.property_id].append(GanttDayPrice(night.date, night.price))

        result: list[GanttProperty] = []
        for prop in properties:
            if prop.status not in (PropertyStatus.ACTIVE, PropertyStatus.PAUSED):
                continue

            bookings = await self._booking_repo.list_by_property_date_range(
                prop.id,
                start_date,
                end_date,
                company_id=company_id,
            )

            gantt_bookings: list[GanttBooking] = []
            for b in bookings:
                guest = await self._guest_repo.get_by_id(b.guest_id)
                gantt_bookings.append(
                    GanttBooking(
                        id=b.id,
                        guest_name=guest.name if guest else "Unknown",
                        check_in=b.check_in,
                        check_out=b.check_out,
                        rental_mode=b.rental_mode.value,
                        status=b.status.value,
                        source=b.source.value,
                        gantt_color=b.gantt_color,
                        gantt_icon=b.gantt_icon,
                        adults_count=b.adults_count,
                        children_count=b.children_count,
                        total_price=float(b.total_price),
                        overbooking=b.overbooking,
                    )
                )

            result.append(
                GanttProperty(
                    id=prop.id,
                    name=prop.name,
                    internal_name=prop.internal_name,
                    type=prop.type.value,
                    status=prop.status.value,
                    bookings=gantt_bookings,
                    blocks=[
                        GanttBlock(block.id, block.start_date, block.end_date, block.reason, _clash(block, bookings))
                        for block in closed[prop.id]
                    ],
                    rental_mode=prop.rental_mode.value,
                    day_prices=priced[prop.id],
                )
            )

        return GanttData(properties=result)


def _clash(block, bookings) -> bool:
    """A platform's booking (not a mere closure) over a Day booking of another source,
    as the calendar reader tells it: the same night sold twice."""
    if block.feed_id is None or not block.reserved or block.starts_at is None:
        return False
    return any(
        b.status not in (BookingStatus.CANCELLED, BookingStatus.COMPLETED)
        and b.source.value != block.source
        and b.check_in < block.ends_at
        and b.check_out > block.starts_at
        for b in bookings
    )
