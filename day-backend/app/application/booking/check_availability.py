"""Which properties are free for a date range, and what they cost.

Both bots need this and so does anyone driving the API directly, so it lives in
the booking context rather than inside a bot.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from app.application.booking.blocks import blocks_stay
from app.application.booking.create_booking import apply_default_times
from app.application.booking.price_calculator import PriceCalculatorService
from app.application.booking.stay_rules import company_now
from app.config import settings
from app.domain.booking.repositories import BookingRepository
from app.domain.booking.stay_rules import RuleBreach, stay_breaches
from app.domain.booking.value_objects import BookingStatus, RentalMode
from app.domain.property.entities import Property
from app.domain.property.repositories import PropertyRepository
from app.domain.property.value_objects import PropertyStatus
from app.domain.settings.repositories import CompanySettingsRepository

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
    # The stay as this flat books it: its own check-in and check-out hours.
    check_in: datetime
    check_out: datetime
    # Pricing is optional per property; a unit with no configuration is still
    # free, we just cannot quote it.
    price_error: str | None = None
    # The flat's stay rules this stay breaks; only an operator's search sees such a flat.
    rule_breaches: list[RuleBreach] = field(default_factory=list)


def _as_datetime(value: date | datetime, hour: int) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.combine(value, time(hour=hour))


def _stay(
    check_in: date | datetime, check_out: date | datetime, rental_mode: RentalMode, prop: Property | None
) -> tuple[datetime, datetime]:
    """The asked stay as this flat would book it: a daily date takes the flat's own hours."""
    if rental_mode == RentalMode.DAILY:
        return apply_default_times(  # type: ignore[return-value]
            check_in,
            check_out,
            rental_mode,
            check_in_hour=prop.check_in_hour if prop else None,
            check_out_hour=prop.check_out_hour if prop else None,
        )
    return (
        _as_datetime(check_in, settings.DEFAULT_CHECK_IN_HOUR),
        _as_datetime(check_out, settings.DEFAULT_CHECK_OUT_HOUR),
    )


class CheckAvailabilityService:
    def __init__(
        self,
        property_repo: PropertyRepository,
        booking_repo: BookingRepository,
        price_calculator: PriceCalculatorService,
        settings_repo: CompanySettingsRepository | None = None,
        *,
        now: Callable[[], datetime | None] | None = None,
    ) -> None:
        self._properties = property_repo
        self._bookings = booking_repo
        self._prices = price_calculator
        self._settings = settings_repo
        self._now = now

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
        with_rule_breaches: bool = False,
    ) -> list[AvailableProperty]:
        """`with_rule_breaches`: also the flats whose stay rules the stay breaks, each
        with the rules, for an operator who may book them by confirming. Without it
        the search offers only what booking would accept."""
        start, end = _stay(check_in, check_out, rental_mode, None)
        if end <= start:
            raise ValueError("Check-out must be after check-in")

        properties = await self._all_properties(company_id)
        # The repository compares with midnight of end_date, and a flat's own
        # check-out can run past a booking that starts later that day; a day
        # wider catches it, and the exact check below decides.
        # A day wider on each side: a cleaning buffer (at most a day) reaches the
        # bookings before the stay and past the midnight after it.
        bookings = await self._bookings.list_by_company_date_range(
            company_id, start.date() - timedelta(days=1), end.date() + timedelta(days=2)
        )
        now = self._now() if self._now is not None else await company_now(self._settings, company_id)

        taken: dict[uuid.UUID, list] = defaultdict(list)
        for booking in bookings:
            if booking.status in _BLOCKING_STATUSES:
                taken[booking.property_id].append(booking)
        closed: dict[uuid.UUID, list] = defaultdict(list)
        for block in await self._bookings.list_company_blocks(
            company_id, start.date() - timedelta(days=1), end.date() + timedelta(days=1)
        ):
            closed[block.property_id].append(block)

        results: list[AvailableProperty] = []
        for prop in properties:
            if prop.status != PropertyStatus.ACTIVE:
                continue
            start, end = _stay(check_in, check_out, rental_mode, prop)
            # Half-open interval: a checkout at noon and a check-in at 14:00 on
            # the same day do not collide.
            if any(b.check_in < end and b.check_out > start for b in taken[prop.id]):
                continue
            if blocks_stay(closed[prop.id], start, end):
                continue
            if rental_mode == RentalMode.HOURLY and prop.rental_mode == RentalMode.DAILY:
                continue
            if rental_mode == RentalMode.DAILY and prop.rental_mode == RentalMode.HOURLY:
                continue
            # Too small for the party. An unknown capacity stays on offer.
            if prop.max_guests is not None and adults_count + children_count > prop.max_guests:
                continue
            # The same rules booking checks; a completed neighbour still needs its cleaning.
            breaches = stay_breaches(prop, start, end, rental_mode, now=now, neighbours=taken[prop.id])
            if breaches and not with_rule_breaches:
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

            results.append(
                AvailableProperty(
                    property=prop,
                    total_price=total,
                    check_in=start,
                    check_out=end,
                    price_error=error,
                    rule_breaches=breaches,
                )
            )

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
