"""Analytics domain value objects."""

from __future__ import annotations

import enum


class PeriodPreset(str, enum.Enum):
    WEEK = "week"
    MONTH = "month"
    QUARTER = "quarter"
    YEAR = "year"
    CUSTOM = "custom"


class Granularity(str, enum.Enum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"
