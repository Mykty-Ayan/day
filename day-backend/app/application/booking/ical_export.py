"""A flat's occupancy as an iCal feed, for Airbnb and Booking.com to import.

Until Channex is live, iCal is the only way the platforms learn about a
booking taken in Day. The feed says only which nights are taken — no guest,
no price — because whoever holds its link can read it.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta

from app.domain.booking.entities import Booking
from app.domain.booking.value_objects import BookingStatus

_FREE = {BookingStatus.CANCELLED}


def blocked_nights(bookings: list[Booking], check_in_hour: int, check_out_hour: int) -> list[tuple[date, date]]:
    """Taken nights as [start, end) date ranges, merged.

    Night D runs from D at check-in time to D+1 at check-out time; a booking
    takes every night it overlaps. So an hourly booking at 10:00 takes the
    night before (its guest leaves at noon), and one at 15:00 takes that
    evening's night.
    """
    nights: set[date] = set()
    for booking in bookings:
        if booking.status in _FREE:
            continue
        touched = False
        day = booking.check_in.date() - timedelta(days=1)
        while datetime.combine(day, time(check_in_hour)) < booking.check_out:
            night_start = datetime.combine(day, time(check_in_hour))
            night_end = datetime.combine(day + timedelta(days=1), time(check_out_hour))
            if booking.check_in < night_end and booking.check_out > night_start:
                nights.add(day)
                touched = True
            day += timedelta(days=1)
        if not touched:
            # Inside the turnover gap (say 12:00–14:00) it touches no night, but a
            # stay running through that day would clash. A feed only says "night
            # taken", so take the evening's night: safe, at worst one night unsold.
            nights.add(booking.check_in.date())

    ranges: list[tuple[date, date]] = []
    for night in sorted(nights):
        if ranges and ranges[-1][1] == night:
            ranges[-1] = (ranges[-1][0], night + timedelta(days=1))
        else:
            ranges.append((night, night + timedelta(days=1)))
    return ranges


def render_calendar(property_id: uuid.UUID, ranges: list[tuple[date, date]], *, stamp: datetime) -> str:
    """RFC 5545 with all-day events; DTEND is the morning the guest leaves, as the platforms read it."""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Day PMS//Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    for start, end in ranges:
        lines += [
            "BEGIN:VEVENT",
            f"UID:{property_id}-{start:%Y%m%d}@day-pms",
            f"DTSTAMP:{stamp:%Y%m%dT%H%M%SZ}",
            f"DTSTART;VALUE=DATE:{start:%Y%m%d}",
            f"DTEND;VALUE=DATE:{end:%Y%m%d}",
            "SUMMARY:Not available",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"
