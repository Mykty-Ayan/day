from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.domain.booking.repositories import BookingRepository
from app.domain.booking.value_objects import BookingStatus
from app.domain.channex.gateway import ChannexGateway
from app.domain.channex.repositories import ChannexListingRepository
from app.domain.channex.value_objects import ListingSyncState
from app.domain.property.repositories import PricingConfigRepository


@dataclass
class PushAriInput:
    company_id: uuid.UUID
    property_id: uuid.UUID
    date_from: date
    date_to: date
    rate: Decimal | None = None  # override; defaults to the pricing config base price
    min_stay: int | None = None


@dataclass
class PushAriResult:
    days_pushed: int
    blocked_dates: list[date]


class PushAriService:
    """Push availability and nightly rate for a listing's date range.

    Availability is derived from Day PMS bookings: a night covered by any
    non-cancelled booking is pushed as 0, everything else as 1. Channex also
    auto-decrements on channel bookings, so this push is the reconciliation
    that keeps direct bookings blocking the channels too.
    """

    def __init__(
        self,
        listing_repo: ChannexListingRepository,
        booking_repo: BookingRepository,
        pricing_repo: PricingConfigRepository,
        gateway: ChannexGateway,
    ) -> None:
        self._listings = listing_repo
        self._bookings = booking_repo
        self._pricing = pricing_repo
        self._gateway = gateway

    async def execute(self, inp: PushAriInput) -> PushAriResult:
        listing = await self._listings.get_by_property(inp.property_id)
        if listing is None or listing.company_id != inp.company_id:
            raise ValueError("Listing is not onboarded to Channex")
        if listing.sync_state != ListingSyncState.ACTIVE:
            raise ValueError("Listing is not active in Channex")
        if inp.date_to <= inp.date_from:
            raise ValueError("date_to must be after date_from")

        rate = inp.rate
        if rate is None:
            config = await self._pricing.get_by_property(inp.property_id)
            if config is None or config.base_price <= 0:
                raise ValueError("No rate given and property has no base price")
            rate = config.base_price

        bookings = await self._bookings.list_by_property_date_range(
            inp.property_id, inp.date_from, inp.date_to, company_id=inp.company_id
        )
        blocked: set[date] = set()
        for booking in bookings:
            if booking.status == BookingStatus.CANCELLED:
                continue
            night = _as_date(booking.check_in)
            last = _as_date(booking.check_out)
            while night < last:
                if inp.date_from <= night < inp.date_to:
                    blocked.add(night)
                night += timedelta(days=1)

        # Channex treats date_to as inclusive; our input range is check-out
        # style [date_from, date_to), hence the one-day trim.
        await self._gateway.update_restrictions(
            property_id=listing.channex_property_id,
            rate_plan_id=listing.channex_rate_plan_id,
            date_from=inp.date_from,
            date_to=inp.date_to - timedelta(days=1),
            rate=f"{rate:.2f}",
            min_stay_arrival=inp.min_stay,
        )

        # Availability goes out as contiguous runs so a month is a handful of
        # calls, not one per day.
        for run_start, run_end, available in _runs(inp.date_from, inp.date_to, blocked):
            await self._gateway.update_availability(
                property_id=listing.channex_property_id,
                room_type_id=listing.channex_room_type_id,
                date_from=run_start,
                date_to=run_end,
                availability=0 if not available else 1,
            )

        listing.last_synced_at = datetime.utcnow()
        await self._listings.update(listing)

        days = (inp.date_to - inp.date_from).days
        return PushAriResult(days_pushed=days, blocked_dates=sorted(blocked))


def _as_date(value: datetime | date | None) -> date:
    if value is None:
        raise ValueError("Booking has no dates")
    return value.date() if isinstance(value, datetime) else value


def _runs(
    date_from: date, date_to: date, blocked: set[date]
) -> list[tuple[date, date, bool]]:
    """Split [date_from, date_to) into maximal runs of equal availability.

    Channex treats date_to as inclusive, so each run is emitted with its last
    covered day.
    """
    runs: list[tuple[date, date, bool]] = []
    day = date_from
    run_start = day
    run_free = day not in blocked
    while day < date_to:
        free = day not in blocked
        if free != run_free:
            runs.append((run_start, day - timedelta(days=1), run_free))
            run_start, run_free = day, free
        day += timedelta(days=1)
    runs.append((run_start, date_to - timedelta(days=1), run_free))
    return runs
