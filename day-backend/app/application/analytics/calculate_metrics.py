"""Use case: Calculate analytics metrics for a company."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.domain.analytics.entities import AnalyticsSummary, PropertyMetrics
from app.domain.analytics.repositories import AnalyticsRepository
from app.domain.property.entities import PropertyCosts
from app.domain.property.repositories import PropertyCostsRepository


@dataclass
class CalculateMetricsInput:
    company_id: uuid.UUID
    date_from: date
    date_to: date
    property_ids: list[uuid.UUID] | None = None
    source: str | None = None


@dataclass
class CalculateMetricsResult:
    summary: AnalyticsSummary
    properties: list[PropertyMetrics]


class CalculateMetricsService:
    def __init__(
        self,
        analytics_repo: AnalyticsRepository,
        costs_repo: PropertyCostsRepository,
    ) -> None:
        self._analytics_repo = analytics_repo
        self._costs_repo = costs_repo

    async def execute(self, inp: CalculateMetricsInput) -> CalculateMetricsResult:
        if inp.date_to <= inp.date_from:
            raise ValueError("date_to must be after date_from")

        properties = await self._analytics_repo.get_property_metrics(
            inp.company_id,
            inp.date_from,
            inp.date_to,
            property_ids=inp.property_ids,
            source=inp.source,
        )

        # What each flat costs is stored per property and is not part of the
        # booking aggregate, so it is joined here rather than in the query.
        costs = await self._costs_repo.list_for_properties([pm.property_id for pm in properties])
        period_days = (inp.date_to - inp.date_from).days
        for pm in properties:
            _apply_costs(pm, costs.get(pm.property_id), period_days)

        # Build summary from per-property metrics
        summary = AnalyticsSummary()
        summary.properties_count = len(properties)

        # booked_nights / vacancy_days are now (possibly fractional) Decimals,
        # so these accumulators are Decimal too.
        total_booked_nights = Decimal("0")
        total_available_nights = Decimal("0")
        weighted_stay_sum = Decimal("0")

        for pm in properties:
            summary.total_revenue += pm.revenue
            summary.total_expenses += pm.expenses
            summary.total_profit += pm.profit
            summary.total_commission += pm.commission
            summary.total_fixed_costs += pm.fixed_costs
            summary.total_variable_costs += pm.variable_costs
            summary.total_bookings += pm.total_bookings
            summary.total_booked_nights += pm.booked_nights
            summary.total_vacancy_days += pm.vacancy_days
            total_booked_nights += pm.booked_nights
            total_available_nights += pm.booked_nights + pm.vacancy_days
            weighted_stay_sum += pm.avg_stay_duration * pm.total_bookings

        # Overall ADR (guarded against fractional/zero denominators)
        if total_booked_nights > 0:
            summary.overall_adr = summary.total_revenue / total_booked_nights

        # Overall RevPAR
        if total_available_nights > 0:
            summary.overall_revpar = summary.total_revenue / total_available_nights
            summary.overall_occupancy_rate = (
                total_booked_nights / total_available_nights * 100
            )

        # Overall avg stay duration
        if summary.total_bookings > 0:
            summary.avg_stay_duration = weighted_stay_sum / summary.total_bookings

        return CalculateMetricsResult(summary=summary, properties=properties)


def _apply_costs(pm: PropertyMetrics, costs: PropertyCosts | None, period_days: int) -> None:
    """Fill in what the flat cost, and what is actually left.

    A flat with no costs recorded keeps the old arithmetic — revenue minus
    commission — rather than reporting an error or a zero. That is not the right
    number, but it is the number that was there before anyone filled the form
    in, and a report that refuses to render is worse than one that is
    incomplete for the flats nobody has configured yet.
    """
    if costs is not None:
        pm.fixed_costs = costs.fixed_cost(period_days)
        # The cleaner is paid once per stay; consumables go by night.
        pm.variable_costs = (
            costs.cleaning_cost * pm.total_bookings
            + costs.consumables_per_night * pm.booked_nights
        )

    pm.expenses = pm.commission + pm.fixed_costs + pm.variable_costs
    pm.profit = pm.revenue - pm.expenses
