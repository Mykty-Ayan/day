"""An apartment's stay rules checked against a booking made in Day.

Bookings from the OTAs (Channex) and iCal are not checked: the guest is already
booked there. The rules go to the OTAs as restrictions instead.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable, Protocol

from app.domain.booking.value_objects import RentalMode


class StayRules(Protocol):
    """The apartment's rules; None is no rule."""

    min_nights: int | None
    max_nights: int | None
    buffer_hours: int | None
    min_lead_hours: int | None


class Stay(Protocol):
    check_in: datetime
    check_out: datetime
    rental_mode: RentalMode


@dataclass(frozen=True)
class RuleBreach:
    """One rule the booking breaks: its name (the property field), the limit, what the booking has."""

    rule: str
    limit: int
    actual: int


def _hours(span: timedelta) -> int:
    return math.floor(span.total_seconds() / 3600)


def stay_breaches(
    rules: StayRules,
    check_in: datetime,
    check_out: datetime,
    rental_mode: RentalMode,
    *,
    now: datetime | None,
    neighbours: Iterable[Stay] = (),
) -> list[RuleBreach]:
    """Every rule the booking breaks, in a fixed order: nights, buffer, lead time.

    `now` is the company's clock (naive, as check-ins are); None skips the lead
    time, for a change that keeps the dates. `neighbours` are the flat's other
    active bookings near the stay.
    """
    found: list[RuleBreach] = []

    # Nights bind a daily stay only: an hourly booking has none.
    if rental_mode == RentalMode.DAILY:
        nights = (check_out.date() - check_in.date()).days
        if rules.min_nights is not None and nights < rules.min_nights:
            found.append(RuleBreach("min_nights", rules.min_nights, nights))
        if rules.max_nights is not None and nights > rules.max_nights:
            found.append(RuleBreach("max_nights", rules.max_nights, nights))

    # Cleaning time around an hourly booking. Two daily stays turn over on the
    # flat's own hours (out at 12:00, in at 14:00): the buffer does not split them.
    if rules.buffer_hours is not None:
        buffer = timedelta(hours=rules.buffer_hours)
        gaps = [
            check_in - other.check_out if other.check_out <= check_in else other.check_in - check_out
            for other in neighbours
            if RentalMode.HOURLY in (rental_mode, other.rental_mode)
            # An overlap is refused on its own, as an overlap.
            and (other.check_out <= check_in or other.check_in >= check_out)
        ]
        short = [gap for gap in gaps if gap < buffer]
        if short:
            found.append(RuleBreach("buffer_hours", rules.buffer_hours, _hours(min(short))))

    if now is not None and rules.min_lead_hours is not None:
        ahead = check_in - now
        if ahead < timedelta(hours=rules.min_lead_hours):
            found.append(RuleBreach("min_lead_hours", rules.min_lead_hours, _hours(ahead)))

    return found
