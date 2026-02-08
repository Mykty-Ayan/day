from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from app.domain.booking.repositories import BookingRepository, GuestRepository
from app.domain.property.repositories import PropertyRepository
from app.domain.property.value_objects import PropertyStatus


@dataclass
class GanttBooking:
    id: uuid.UUID
    guest_name: str
    check_in: date
    check_out: date
    status: str
    source: str
    gantt_color: str
    gantt_icon: str | None
    adults_count: int
    children_count: int
    total_price: float


@dataclass
class GanttProperty:
    id: uuid.UUID
    name: str
    internal_name: str
    type: str
    bookings: list[GanttBooking]


@dataclass
class GanttData:
    properties: list[GanttProperty]


class GetGanttDataService:
    def __init__(
        self,
        property_repo: PropertyRepository,
        booking_repo: BookingRepository,
        guest_repo: GuestRepository,
    ) -> None:
        self._property_repo = property_repo
        self._booking_repo = booking_repo
        self._guest_repo = guest_repo

    async def execute(
        self,
        company_id: uuid.UUID,
        start_date: date,
        end_date: date,
    ) -> GanttData:
        # Get all active properties for company
        properties = await self._property_repo.list_by_company(
            company_id, limit=100
        )

        result: list[GanttProperty] = []
        for prop in properties:
            if prop.status in (PropertyStatus.ARCHIVED,):
                continue

            bookings = await self._booking_repo.list_by_property_date_range(
                prop.id, start_date, end_date,
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
                        status=b.status.value,
                        source=b.source.value,
                        gantt_color=b.gantt_color,
                        gantt_icon=b.gantt_icon,
                        adults_count=b.adults_count,
                        children_count=b.children_count,
                        total_price=float(b.total_price),
                    )
                )

            result.append(
                GanttProperty(
                    id=prop.id,
                    name=prop.name,
                    internal_name=prop.internal_name,
                    type=prop.type.value,
                    bookings=gantt_bookings,
                )
            )

        return GanttData(properties=result)
