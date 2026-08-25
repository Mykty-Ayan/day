"""Reading dates out of chat messages.

People type "12.08", "12.08-15.08", "с 3 по 7 сентября", "завтра". This handles
the shapes that actually turn up and refuses everything else rather than
guessing — a wrong date silently becomes a wrong booking.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta

_MONTHS = {
    "января": 1, "январь": 1, "янв": 1,
    "февраля": 2, "февраль": 2, "фев": 2,
    "марта": 3, "март": 3, "мар": 3,
    "апреля": 4, "апрель": 4, "апр": 4,
    "мая": 5, "май": 5,
    "июня": 6, "июнь": 6, "июн": 6,
    "июля": 7, "июль": 7, "июл": 7,
    "августа": 8, "август": 8, "авг": 8,
    "сентября": 9, "сентябрь": 9, "сен": 9, "сент": 9,
    "октября": 10, "октябрь": 10, "окт": 10,
    "ноября": 11, "ноябрь": 11, "ноя": 11,
    "декабря": 12, "декабрь": 12, "дек": 12,
}

_NUMERIC = re.compile(r"\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b")
_DAY_MONTH_WORD = re.compile(r"\b(\d{1,2})\s+([а-яё]+)\b", re.IGNORECASE)


@dataclass(frozen=True)
class DateRange:
    check_in: date
    check_out: date


def _resolve_year(day: int, month: int, today: date, year: int | None) -> date | None:
    if year is not None:
        if year < 100:
            year += 2000
        try:
            return date(year, month, day)
        except ValueError:
            return None
    try:
        candidate = date(today.year, month, day)
    except ValueError:
        return None
    # A bare "12.08" in December means next year, not eight months ago.
    if candidate < today - timedelta(days=1):
        try:
            return date(today.year + 1, month, day)
        except ValueError:
            return None
    return candidate


def parse_dates(text: str, today: date | None = None) -> list[date]:
    """Every date mentioned, in the order written."""
    today = today or date.today()
    lowered = text.lower()
    found: list[tuple[int, date]] = []

    for match in _NUMERIC.finditer(lowered):
        day, month = int(match.group(1)), int(match.group(2))
        year = int(match.group(3)) if match.group(3) else None
        parsed = _resolve_year(day, month, today, year)
        if parsed:
            found.append((match.start(), parsed))

    for match in _DAY_MONTH_WORD.finditer(lowered):
        month = _MONTHS.get(match.group(2))
        if month is None:
            continue
        parsed = _resolve_year(int(match.group(1)), month, today, None)
        if parsed:
            found.append((match.start(), parsed))

    if "послезавтра" in lowered:
        found.append((lowered.index("послезавтра"), today + timedelta(days=2)))
    elif "завтра" in lowered:
        found.append((lowered.index("завтра"), today + timedelta(days=1)))
    if "сегодня" in lowered:
        found.append((lowered.index("сегодня"), today))

    found.sort(key=lambda item: item[0])
    seen: list[date] = []
    for _, value in found:
        if value not in seen:
            seen.append(value)
    return seen


def parse_range(text: str, today: date | None = None) -> DateRange | None:
    """A check-in/check-out pair, or None when the message is not one.

    A single date is treated as a one-night stay: someone asking about "12.08"
    means that night, and answering "free / not free" is more useful than asking
    them to restate it.
    """
    today = today or date.today()
    dates = parse_dates(text, today)
    if not dates:
        return None
    if len(dates) == 1:
        return DateRange(check_in=dates[0], check_out=dates[0] + timedelta(days=1))

    check_in, check_out = dates[0], dates[1]
    if check_out <= check_in:
        return None
    return DateRange(check_in=check_in, check_out=check_out)


def format_date(value: date) -> str:
    return value.strftime("%d.%m.%Y")
