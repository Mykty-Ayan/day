"""Which properties are free for a date range, and what they cost.

Both bots need this and so does anyone driving the API directly, so it lives in
the booking context rather than inside a bot.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal

from app.application.booking.price_calculator import PriceCalculatorService
from app.config import settings
from app.domain.booking.repositories import BookingRepository
from app.domain.booking.value_objects import BookingStatus, RentalMode
from app.domain.property.entities import Property
from app.domain.property.repositories import PropertyRepository
from app.domain.property.value_objects import PropertyStatus

# A cancelled booking does not occupy anything; everything else does.
_BLOCKING_STATUSES = {
    BookingStatus.PENDING,
    BookingStatus.CONFIRMED,
    BookingStatus.CHECKED_IN,
    BookingStatus.CHECKED_OUT,
    BookingStatus.COMPLETED,
}

_PROPERTY_PAGE_SIZE = 200


@dataclass
class AvailableProperty:
    property: Property
    total_price: Decimal | None
    # Pricing is optional per property; a unit with no configuration is still
    # free, we just cannot quote it.
    price_error: str | None = None


def _as_datetime(value: date | datetime, hour: int) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.combine(value, time(hour=hour))


class CheckAvailabilityService:
    def __init__(
        self,
        property_repo: PropertyRepository,
        booking_repo: BookingRepository,
        price_calculator: PriceCalculatorService,
    ) -> None:
        self._properties = property_repo
        self._bookings = booking_repo
        self._prices = price_calculator

    async def execute(
        self,
        company_id: uuid.UUID,
        check_in: date | datetime,
        check_out: date | datetime,
        *,
        adults_count: int = 1,
        children_count: int = 0,
        rental_mode: RentalMode = RentalMode.DAILY,
        with_prices: bool = True,
    ) -> list[AvailableProperty]:
        start = _as_datetime(check_in, settings.DEFAULT_CHECK_IN_HOUR)
        end = _as_datetime(check_out, settings.DEFAULT_CHECK_OUT_HOUR)
        if end <= start:
            raise ValueError("Check-out must be after check-in")

        properties = await self._all_properties(company_id)
        bookings = await self._bookings.list_by_company_date_range(company_id, start.date(), end.date())

        occupied: set[uuid.UUID] = set()
        for booking in bookings:
            if booking.status not in _BLOCKING_STATUSES:
                continue
            # Half-open interval: a checkout at noon and a check-in at 14:00 on
            # the same day do not collide.
            if booking.check_in < end and booking.check_out > start:
                occupied.add(booking.property_id)

        results: list[AvailableProperty] = []
        for prop in properties:
            if prop.status != PropertyStatus.ACTIVE or prop.id in occupied:
                continue
            if rental_mode == RentalMode.HOURLY and prop.rental_mode == RentalMode.DAILY:
                continue
            if rental_mode == RentalMode.DAILY and prop.rental_mode == RentalMode.HOURLY:
                continue

            total, error = None, None
            if with_prices:
                try:
                    breakdown = await self._prices.calculate(
                        prop.id, start, end, adults_count, children_count, rental_mode
                    )
                    total = breakdown.total
                except ValueError as exc:
                    error = str(exc)

            results.append(AvailableProperty(property=prop, total_price=total, price_error=error))

        results.sort(key=lambda item: (item.total_price is None, item.total_price or 0))
        return results

    async def _all_properties(self, company_id: uuid.UUID) -> list[Property]:
        properties: list[Property] = []
        offset = 0
        while True:
            batch = await self._properties.list_by_company(
                company_id, offset=offset, limit=_PROPERTY_PAGE_SIZE
            )
            if not batch:
                break
            properties.extend(batch)
            if len(batch) < _PROPERTY_PAGE_SIZE:
                break
            offset += _PROPERTY_PAGE_SIZE
        return properties
