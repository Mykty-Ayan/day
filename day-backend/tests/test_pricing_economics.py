"""Where the floor and the RevPAR target come from.

Both halves may be missing, and they mean different things when they are. No
costs recorded is a statement about our paperwork, not about the flat; no
RevPAR is too little history to aim at. Reading either as a number would price
nights against something nobody measured.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.application.pricing.economics import TRAILING_DAYS, BuildEconomicsService
from app.domain.analytics.entities import PropertyMetrics
from app.domain.analytics.repositories import AnalyticsRepository
from app.domain.property.entities import PropertyCosts
from app.domain.property.repositories import PropertyCostsRepository

COMPANY = uuid.UUID("00000000-0000-0000-0000-000000000001")
FLAT = uuid.UUID("00000000-0000-0000-0000-0000000000aa")
TODAY = date(2026, 8, 27)


class FakeCosts(PropertyCostsRepository):
    def __init__(self, costs: PropertyCosts | None = None) -> None:
        self._costs = costs

    async def get_by_property(self, property_id):
        return self._costs

    async def list_for_properties(self, property_ids):
        return {FLAT: self._costs} if self._costs else {}

    async def upsert(self, costs):
        self._costs = costs
        return costs


class FakeAnalytics(AnalyticsRepository):
    def __init__(self, metrics=None) -> None:
        self.metrics = metrics or []
        self.asked: list[tuple[date, date]] = []

    async def get_property_metrics(
        self, company_id, date_from, date_to, *, property_ids=None, source=None
    ):
        self.asked.append((date_from, date_to))
        return self.metrics

    async def get_time_series(self, *args, **kwargs):
        return []


def metrics(revpar="12000", nights="30"):
    return PropertyMetrics(
        property_id=FLAT, revpar=Decimal(revpar), booked_nights=Decimal(nights)
    )


def costs(cleaning=4000, consumables=500, rent=300000):
    return PropertyCosts(
        property_id=FLAT,
        monthly_rent=Decimal(rent),
        cleaning_cost=Decimal(cleaning),
        consumables_per_night=Decimal(consumables),
    )


async def build(costs_repo, analytics_repo, nights=1):
    service = BuildEconomicsService(costs_repo, analytics_repo)
    return await service.execute(COMPANY, FLAT, nights=nights, today=TODAY)


class TestTheFloor:
    @pytest.mark.asyncio
    async def test_it_comes_from_the_flat_recorded_costs(self):
        result = await build(FakeCosts(costs()), FakeAnalytics([metrics()]))

        assert result.floor == Decimal(4500)

    @pytest.mark.asyncio
    async def test_a_longer_stay_carries_the_same_cleaning(self):
        result = await build(FakeCosts(costs()), FakeAnalytics([metrics()]), nights=4)

        assert result.marginal_cost == Decimal(6000)

    @pytest.mark.asyncio
    async def test_rent_never_reaches_it(self):
        result = await build(FakeCosts(costs(rent=900000)), FakeAnalytics([metrics()]))

        assert result.floor == Decimal(4500)

    @pytest.mark.asyncio
    async def test_a_flat_with_no_costs_recorded_has_a_floor_of_zero(self):
        # Not "sell it for nothing" — "we have not written down what it costs".
        # The suggestion then rests on RevPAR and the caps alone.
        result = await build(FakeCosts(None), FakeAnalytics([metrics()]))

        assert result.floor == Decimal(0)


class TestRevpar:
    @pytest.mark.asyncio
    async def test_it_comes_from_the_trailing_window(self):
        analytics = FakeAnalytics([metrics(revpar="12000")])

        result = await build(FakeCosts(costs()), analytics)

        assert result.revpar == Decimal(12000)
        date_from, date_to = analytics.asked[0]
        assert (date_to - date_from).days == TRAILING_DAYS
        assert date_to == TODAY

    @pytest.mark.asyncio
    async def test_too_little_history_is_no_target_rather_than_a_small_one(self):
        # Four nights sold in ninety days makes a RevPAR that is one lucky
        # booking divided by the calendar. Aiming at it would be worse than
        # aiming at nothing.
        result = await build(FakeCosts(costs()), FakeAnalytics([metrics(nights="4")]))

        assert result.revpar is None

    @pytest.mark.asyncio
    async def test_a_flat_with_no_history_at_all_has_no_target(self):
        result = await build(FakeCosts(costs()), FakeAnalytics([]))

        assert result.revpar is None

    @pytest.mark.asyncio
    async def test_another_flat_metrics_are_not_borrowed(self):
        # The repository is asked for one flat but returns rows; taking the
        # first one would price this flat off its neighbour's history.
        other = PropertyMetrics(
            property_id=uuid.uuid4(), revpar=Decimal(99000), booked_nights=Decimal(40)
        )

        result = await build(FakeCosts(costs()), FakeAnalytics([other]))

        assert result.revpar is None
