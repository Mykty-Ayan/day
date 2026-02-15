"""Analytics Pydantic schemas for request/response models."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.domain.analytics.value_objects import Granularity, PeriodPreset

# ---------- Request Schemas ----------


class AnalyticsFilters(BaseModel):
    """Query parameters for analytics endpoints."""

    date_from: date | None = None
    date_to: date | None = None
    period: PeriodPreset | None = None
    granularity: Granularity = Granularity.DAY
    property_id: list[uuid.UUID] | None = None
    source: str | None = None


# ---------- Response Schemas ----------


class PropertyMetricsResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={Decimal: float},
    )

    property_id: uuid.UUID
    property_name: str
    property_internal_name: str
    revenue: Decimal
    adr: Decimal
    revpar: Decimal
    expenses: Decimal
    profit: Decimal
    commission: Decimal
    vacancy_days: int
    occupancy_rate: Decimal
    avg_stay_duration: Decimal
    total_bookings: int
    booked_nights: int


class AnalyticsSummaryResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={Decimal: float},
    )

    total_revenue: Decimal
    total_expenses: Decimal
    total_profit: Decimal
    total_commission: Decimal
    overall_adr: Decimal
    overall_revpar: Decimal
    overall_occupancy_rate: Decimal
    avg_stay_duration: Decimal
    total_bookings: int
    total_booked_nights: int
    total_vacancy_days: int
    properties_count: int


class AnalyticsMetricsResponse(BaseModel):
    """Full analytics response: summary + per-property breakdown."""

    summary: AnalyticsSummaryResponse
    properties: list[PropertyMetricsResponse]
    date_from: date
    date_to: date


class TimeSeriesPointResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={Decimal: float},
    )

    period_start: date | None = None
    period_label: str
    revenue: Decimal
    bookings_count: int
    booked_nights: int
    occupancy_rate: Decimal


class TimeSeriesResponse(BaseModel):
    """Time series analytics response."""

    data: list[TimeSeriesPointResponse]
    granularity: Granularity
    date_from: date
    date_to: date


class ExportResponse(BaseModel):
    """CSV export response metadata."""

    filename: str
    content_type: str = "text/csv"
