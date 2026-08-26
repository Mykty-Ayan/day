"""Analytics API routes (Phase 5)."""

from __future__ import annotations

import csv
import io
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.analytics.calculate_metrics import (
    CalculateMetricsInput,
    CalculateMetricsService,
)
from app.application.analytics.get_time_series import (
    GetTimeSeriesInput,
    GetTimeSeriesService,
)
from app.domain.analytics.value_objects import Granularity, PeriodPreset
from app.domain.auth.permissions import Permission
from app.infrastructure.database import get_session
from app.infrastructure.repositories.analytics import SqlAnalyticsRepository
from app.infrastructure.repositories.property import SqlPropertyCostsRepository
from app.presentation.api.deps import get_company_id, require
from app.presentation.schemas.analytics import (
    AnalyticsMetricsResponse,
    AnalyticsSummaryResponse,
    PropertyMetricsResponse,
    TimeSeriesPointResponse,
    TimeSeriesResponse,
)

analytics_router = APIRouter(prefix="/analytics", tags=["analytics"])


def _resolve_dates(
    date_from: date | None,
    date_to: date | None,
    period: PeriodPreset | None,
) -> tuple[date, date]:
    """Resolve date range from explicit dates or period preset."""
    today = date.today()

    if date_from and date_to:
        return date_from, date_to

    if period is None:
        period = PeriodPreset.MONTH

    if period == PeriodPreset.WEEK:
        return today - timedelta(days=7), today
    elif period == PeriodPreset.MONTH:
        return today - timedelta(days=30), today
    elif period == PeriodPreset.QUARTER:
        return today - timedelta(days=90), today
    elif period == PeriodPreset.YEAR:
        return today - timedelta(days=365), today
    else:
        # CUSTOM requires explicit dates
        if not date_from or not date_to:
            return today - timedelta(days=30), today
        return date_from, date_to


@analytics_router.get(
    "/metrics",
    response_model=AnalyticsMetricsResponse,
    dependencies=[Depends(require(Permission.ANALYTICS_READ))],
)
async def get_metrics(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    period: PeriodPreset | None = Query(default=None),
    property_id: list[uuid.UUID] | None = Query(default=None),
    source: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    resolved_from, resolved_to = _resolve_dates(date_from, date_to, period)

    repo = SqlAnalyticsRepository(session)
    svc = CalculateMetricsService(repo, SqlPropertyCostsRepository(session))

    try:
        result = await svc.execute(
            CalculateMetricsInput(
                company_id=company_id,
                date_from=resolved_from,
                date_to=resolved_to,
                property_ids=property_id,
                source=source,
            )
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return AnalyticsMetricsResponse(
        summary=AnalyticsSummaryResponse(
            total_revenue=result.summary.total_revenue,
            total_expenses=result.summary.total_expenses,
            total_profit=result.summary.total_profit,
            total_commission=result.summary.total_commission,
            total_fixed_costs=result.summary.total_fixed_costs,
            total_variable_costs=result.summary.total_variable_costs,
            overall_adr=result.summary.overall_adr,
            overall_revpar=result.summary.overall_revpar,
            overall_occupancy_rate=result.summary.overall_occupancy_rate,
            avg_stay_duration=result.summary.avg_stay_duration,
            total_bookings=result.summary.total_bookings,
            total_booked_nights=result.summary.total_booked_nights,
            total_vacancy_days=result.summary.total_vacancy_days,
            properties_count=result.summary.properties_count,
        ),
        properties=[
            PropertyMetricsResponse(
                property_id=pm.property_id,
                property_name=pm.property_name,
                property_internal_name=pm.property_internal_name,
                revenue=pm.revenue,
                adr=pm.adr,
                revpar=pm.revpar,
                expenses=pm.expenses,
                profit=pm.profit,
                fixed_costs=pm.fixed_costs,
                variable_costs=pm.variable_costs,
                commission=pm.commission,
                vacancy_days=pm.vacancy_days,
                occupancy_rate=pm.occupancy_rate,
                avg_stay_duration=pm.avg_stay_duration,
                total_bookings=pm.total_bookings,
                booked_nights=pm.booked_nights,
            )
            for pm in result.properties
        ],
        date_from=resolved_from,
        date_to=resolved_to,
    )


@analytics_router.get(
    "/time-series",
    response_model=TimeSeriesResponse,
    dependencies=[Depends(require(Permission.ANALYTICS_READ))],
)
async def get_time_series(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    period: PeriodPreset | None = Query(default=None),
    granularity: Granularity = Query(default=Granularity.DAY),
    property_id: list[uuid.UUID] | None = Query(default=None),
    source: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    resolved_from, resolved_to = _resolve_dates(date_from, date_to, period)

    repo = SqlAnalyticsRepository(session)
    svc = GetTimeSeriesService(repo)

    try:
        points = await svc.execute(
            GetTimeSeriesInput(
                company_id=company_id,
                date_from=resolved_from,
                date_to=resolved_to,
                granularity=granularity,
                property_ids=property_id,
                source=source,
            )
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return TimeSeriesResponse(
        data=[
            TimeSeriesPointResponse(
                period_start=p.period_start,
                period_label=p.period_label,
                revenue=p.revenue,
                bookings_count=p.bookings_count,
                booked_nights=p.booked_nights,
                occupancy_rate=p.occupancy_rate,
            )
            for p in points
        ],
        granularity=granularity,
        date_from=resolved_from,
        date_to=resolved_to,
    )


@analytics_router.get("/export", dependencies=[Depends(require(Permission.ANALYTICS_READ))])
async def export_csv(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    period: PeriodPreset | None = Query(default=None),
    property_id: list[uuid.UUID] | None = Query(default=None),
    source: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    resolved_from, resolved_to = _resolve_dates(date_from, date_to, period)

    repo = SqlAnalyticsRepository(session)
    svc = CalculateMetricsService(repo, SqlPropertyCostsRepository(session))

    try:
        result = await svc.execute(
            CalculateMetricsInput(
                company_id=company_id,
                date_from=resolved_from,
                date_to=resolved_to,
                property_ids=property_id,
                source=source,
            )
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Build CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Property",
        "Internal Name",
        "Revenue",
        "ADR",
        "RevPAR",
        "Expenses",
        "Profit",
        "Commission",
        "Fixed costs",
        "Variable costs",
        "Vacancy Days",
        "Occupancy %",
        "Avg Stay",
        "Bookings",
        "Booked Nights",
    ])
    for pm in result.properties:
        writer.writerow([
            pm.property_name,
            pm.property_internal_name,
            f"{pm.revenue:.2f}",
            f"{pm.adr:.2f}",
            f"{pm.revpar:.2f}",
            f"{pm.expenses:.2f}",
            f"{pm.profit:.2f}",
            f"{pm.commission:.2f}",
            f"{pm.fixed_costs:.2f}",
            f"{pm.variable_costs:.2f}",
            pm.vacancy_days,
            f"{pm.occupancy_rate:.1f}",
            f"{pm.avg_stay_duration:.1f}",
            pm.total_bookings,
            pm.booked_nights,
        ])

    # Summary row
    s = result.summary
    writer.writerow([
        "TOTAL",
        "",
        f"{s.total_revenue:.2f}",
        f"{s.overall_adr:.2f}",
        f"{s.overall_revpar:.2f}",
        f"{s.total_expenses:.2f}",
        f"{s.total_profit:.2f}",
        f"{s.total_commission:.2f}",
        s.total_vacancy_days,
        f"{s.overall_occupancy_rate:.1f}",
        f"{s.avg_stay_duration:.1f}",
        s.total_bookings,
        s.total_booked_nights,
    ])

    output.seek(0)
    filename = f"analytics_{resolved_from}_{resolved_to}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
