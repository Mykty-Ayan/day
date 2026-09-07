"""Analytics domain entities (read models)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal


@dataclass
class PropertyMetrics:
    """Aggregated metrics for a single property over a period."""

    property_id: uuid.UUID = field(default_factory=uuid.uuid4)
    property_name: str = ""
    property_internal_name: str = ""
    revenue: Decimal = Decimal("0")
    adr: Decimal = Decimal("0")  # Average Daily Rate
    revpar: Decimal = Decimal("0")  # Revenue Per Available Room-night
    #: Everything the flat cost over the period: commission, rent, utilities,
    #: cleaning and consumables. Split below, because an operator who cannot see
    #: which part grew cannot do anything about it.
    expenses: Decimal = Decimal("0")
    profit: Decimal = Decimal("0")
    commission: Decimal = Decimal("0")
    #: Rent to the flat's owner plus utilities — paid whether it was let or not.
    fixed_costs: Decimal = Decimal("0")
    #: Cleaning and consumables — paid because guests came.
    variable_costs: Decimal = Decimal("0")
    # Occupancy unit = booked *days*: whole calendar nights for daily/multi-day
    # stays, fractional days (hours/24) for sub-day hourly stays. Decimal so
    # sub-day occupancy is not truncated to zero.
    vacancy_days: Decimal = Decimal("0")
    occupancy_rate: Decimal = Decimal("0")
    avg_stay_duration: Decimal = Decimal("0")
    total_bookings: int = 0
    booked_nights: Decimal = Decimal("0")


@dataclass
class TimeSeriesPoint:
    """A single data point in a time series."""

    period_start: date | None = None
    period_label: str = ""
    revenue: Decimal = Decimal("0")
    bookings_count: int = 0
    # Booked days in this bucket: whole nights for daily stays, fractional days
    # for sub-day hourly stays (see SqlAnalyticsRepository.get_time_series).
    booked_nights: Decimal = Decimal("0")
    occupancy_rate: Decimal = Decimal("0")


@dataclass
class AnalyticsSummary:
    """Overall summary metrics across all properties."""

    total_revenue: Decimal = Decimal("0")
    total_expenses: Decimal = Decimal("0")
    total_profit: Decimal = Decimal("0")
    total_commission: Decimal = Decimal("0")
    total_fixed_costs: Decimal = Decimal("0")
    total_variable_costs: Decimal = Decimal("0")
    overall_adr: Decimal = Decimal("0")
    overall_revpar: Decimal = Decimal("0")
    overall_occupancy_rate: Decimal = Decimal("0")
    avg_stay_duration: Decimal = Decimal("0")
    total_bookings: int = 0
    total_booked_nights: Decimal = Decimal("0")
    total_vacancy_days: Decimal = Decimal("0")
    properties_count: int = 0
