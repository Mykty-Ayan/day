"""Use case: Calculate analytics metrics for a company."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from app.domain.analytics.entities import AnalyticsSummary, PropertyMetrics
from app.domain.analytics.repositories import AnalyticsRepository
from app.domain.expenses.entities import ExpenseCategory
from app.domain.expenses.repositories import ExpenseRepository
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
        expense_repo: ExpenseRepository | None = None,
    ) -> None:
        self._analytics_repo = analytics_repo
        self._costs_repo = costs_repo
        self._expense_repo = expense_repo

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

        # The journal is not kept by booking source: a report on one source's
        # bookings leaves it out, or all the company's costs would land on them.
        recorded = await self._recorded_expenses(inp) if inp.source is None else {}
        for pm in properties:
            pm.recorded_expenses = recorded.pop(pm.property_id, Decimal("0"))
            pm.expenses += pm.recorded_expenses
            pm.profit -= pm.recorded_expenses

        # Build summary from per-property metrics
        summary = AnalyticsSummary()
        # What is left was spent for the whole company (internet, software) or
        # for a flat no longer on the list (archived). It is the company's money
        # all the same, so it counts in the total — unless the report is about
        # chosen flats, where it would not belong to any of them.
        if inp.property_ids is None:
            summary.total_recorded_expenses = sum(recorded.values(), Decimal("0"))
            summary.total_expenses += summary.total_recorded_expenses
            summary.total_profit -= summary.total_recorded_expenses
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
            summary.total_recorded_expenses += pm.recorded_expenses
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

    async def _recorded_expenses(self, inp: CalculateMetricsInput) -> dict[uuid.UUID | None, Decimal]:
        """The expense journal's non-void sums for the period, by flat (None: the whole company's).

        The period ends before date_to, as it does for the bookings. Summed here
        from the list rather than in SQL: a company writes tens of expenses a
        month; a GROUP BY in the repository is the upgrade if that grows.
        """
        totals: dict[uuid.UUID | None, Decimal] = {}
        if self._expense_repo is None:
            return totals
        expenses = await self._expense_repo.list(
            inp.company_id, date_from=inp.date_from, date_to=inp.date_to - timedelta(days=1)
        )
        for expense in expenses:
            # Day computes the platforms' commission itself: a journal entry of it would count twice.
            if expense.category == ExpenseCategory.PLATFORM_COMMISSION:
                continue
            totals[expense.property_id] = totals.get(expense.property_id, Decimal("0")) + expense.amount
        return totals


def _apply_costs(pm: PropertyMetrics, costs: PropertyCosts | None, period_days: int) -> None:
    """Fill in the flat's planned costs, and what is left after commission.

    The owner's decision (30 Oct 2026): profit takes its costs from the expense
    journal alone, added on top of this. The planned rent, utilities, cleaning and
    consumables stay as figures for pricing, never subtracted: rent written both
    in the plan and in the journal was counted twice.
    """
    if costs is not None:
        pm.fixed_costs = costs.fixed_cost(period_days)
        # The cleaner is paid once per stay; consumables go by night.
        pm.variable_costs = (
            costs.cleaning_cost * pm.total_bookings
            + costs.consumables_per_night * pm.booked_nights
        )

    pm.expenses = pm.commission
    pm.profit = pm.revenue - pm.expenses
