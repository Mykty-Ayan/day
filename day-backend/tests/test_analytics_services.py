"""Unit tests for analytics application services."""

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.application.analytics.calculate_metrics import (
    CalculateMetricsInput,
    CalculateMetricsService,
)
from app.application.analytics.get_time_series import (
    GetTimeSeriesInput,
    GetTimeSeriesService,
)
from app.domain.analytics.entities import PropertyMetrics, TimeSeriesPoint
from app.domain.analytics.repositories import AnalyticsRepository
from app.domain.analytics.value_objects import Granularity
from app.domain.property.entities import PropertyCosts
from app.domain.property.repositories import PropertyCostsRepository

# ---------- In-memory fake repository ----------


class FakePropertyCostsRepository(PropertyCostsRepository):
    """Costs nobody filled in, unless a test says otherwise."""

    def __init__(self, costs: dict[uuid.UUID, PropertyCosts] | None = None) -> None:
        self._costs = costs or {}

    async def get_by_property(self, property_id: uuid.UUID) -> PropertyCosts | None:
        return self._costs.get(property_id)

    async def list_for_properties(self, property_ids) -> dict[uuid.UUID, PropertyCosts]:
        return {pid: self._costs[pid] for pid in property_ids if pid in self._costs}

    async def upsert(self, costs: PropertyCosts) -> PropertyCosts:
        self._costs[costs.property_id] = costs
        return costs


class FakeAnalyticsRepository(AnalyticsRepository):
    """In-memory analytics repository for testing."""

    def __init__(
        self,
        metrics: list[PropertyMetrics] | None = None,
        time_series: list[TimeSeriesPoint] | None = None,
    ) -> None:
        self._metrics = metrics or []
        self._time_series = time_series or []

    async def get_property_metrics(
        self,
        company_id: uuid.UUID,
        date_from: date,
        date_to: date,
        *,
        property_ids: list[uuid.UUID] | None = None,
        source: str | None = None,
    ) -> list[PropertyMetrics]:
        result = self._metrics
        if property_ids is not None:
            result = [m for m in result if m.property_id in property_ids]
        return result

    async def get_time_series(
        self,
        company_id: uuid.UUID,
        date_from: date,
        date_to: date,
        granularity: Granularity,
        *,
        property_ids: list[uuid.UUID] | None = None,
        source: str | None = None,
    ) -> list[TimeSeriesPoint]:
        return self._time_series


COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
PROPERTY_ID = uuid.UUID("00000000-0000-0000-0000-0000000000aa")


# ---------- CalculateMetricsService ----------


class TestCalculateMetricsService:
    @pytest.mark.asyncio
    async def test_empty_properties_returns_zero_summary(self):
        repo = FakeAnalyticsRepository(metrics=[])
        svc = CalculateMetricsService(repo, FakePropertyCostsRepository())

        result = await svc.execute(
            CalculateMetricsInput(
                company_id=COMPANY_ID,
                date_from=date(2025, 1, 1),
                date_to=date(2025, 1, 31),
            )
        )

        assert result.summary.total_revenue == Decimal("0")
        assert result.summary.total_bookings == 0
        assert result.summary.properties_count == 0
        assert result.properties == []

    @pytest.mark.asyncio
    async def test_single_property_metrics(self):
        pid = uuid.uuid4()
        pm = PropertyMetrics(
            property_id=pid,
            property_name="Beach Villa",
            property_internal_name="beach-1",
            revenue=Decimal("3000"),
            booked_nights=10,
            vacancy_days=20,
            total_bookings=3,
            avg_stay_duration=Decimal("3.33"),
            commission=Decimal("450"),
            expenses=Decimal("450"),
            profit=Decimal("2550"),
            adr=Decimal("300"),
            revpar=Decimal("100"),
            occupancy_rate=Decimal("33.33"),
        )
        repo = FakeAnalyticsRepository(metrics=[pm])
        svc = CalculateMetricsService(repo, FakePropertyCostsRepository())

        result = await svc.execute(
            CalculateMetricsInput(
                company_id=COMPANY_ID,
                date_from=date(2025, 1, 1),
                date_to=date(2025, 1, 31),
            )
        )

        assert result.summary.total_revenue == Decimal("3000")
        assert result.summary.total_bookings == 3
        assert result.summary.properties_count == 1
        assert result.summary.total_commission == Decimal("450")
        assert result.summary.total_profit == Decimal("2550")
        assert len(result.properties) == 1
        assert result.properties[0].property_id == pid

    @pytest.mark.asyncio
    async def test_multiple_properties_aggregation(self):
        pm1 = PropertyMetrics(
            revenue=Decimal("2000"),
            booked_nights=8,
            vacancy_days=22,
            total_bookings=2,
            avg_stay_duration=Decimal("4"),
            commission=Decimal("300"),
            expenses=Decimal("300"),
            profit=Decimal("1700"),
        )
        pm2 = PropertyMetrics(
            revenue=Decimal("5000"),
            booked_nights=15,
            vacancy_days=15,
            total_bookings=5,
            avg_stay_duration=Decimal("3"),
            commission=Decimal("150"),
            expenses=Decimal("150"),
            profit=Decimal("4850"),
        )
        repo = FakeAnalyticsRepository(metrics=[pm1, pm2])
        svc = CalculateMetricsService(repo, FakePropertyCostsRepository())

        result = await svc.execute(
            CalculateMetricsInput(
                company_id=COMPANY_ID,
                date_from=date(2025, 1, 1),
                date_to=date(2025, 1, 31),
            )
        )

        assert result.summary.total_revenue == Decimal("7000")
        assert result.summary.total_bookings == 7
        assert result.summary.properties_count == 2
        assert result.summary.total_booked_nights == 23
        assert result.summary.total_vacancy_days == 37
        assert result.summary.total_commission == Decimal("450")
        assert result.summary.total_profit == Decimal("6550")

    @pytest.mark.asyncio
    async def test_overall_adr_calculation(self):
        pm = PropertyMetrics(
            revenue=Decimal("3000"),
            booked_nights=10,
            vacancy_days=20,
            total_bookings=3,
            avg_stay_duration=Decimal("3.33"),
        )
        repo = FakeAnalyticsRepository(metrics=[pm])
        svc = CalculateMetricsService(repo, FakePropertyCostsRepository())

        result = await svc.execute(
            CalculateMetricsInput(
                company_id=COMPANY_ID,
                date_from=date(2025, 1, 1),
                date_to=date(2025, 1, 31),
            )
        )

        # ADR = 3000 / 10 = 300
        assert result.summary.overall_adr == Decimal("300")

    @pytest.mark.asyncio
    async def test_overall_revpar_calculation(self):
        pm = PropertyMetrics(
            revenue=Decimal("3000"),
            booked_nights=10,
            vacancy_days=20,
            total_bookings=3,
            avg_stay_duration=Decimal("3.33"),
        )
        repo = FakeAnalyticsRepository(metrics=[pm])
        svc = CalculateMetricsService(repo, FakePropertyCostsRepository())

        result = await svc.execute(
            CalculateMetricsInput(
                company_id=COMPANY_ID,
                date_from=date(2025, 1, 1),
                date_to=date(2025, 1, 31),
            )
        )

        # RevPAR = 3000 / (10+20) = 100
        assert result.summary.overall_revpar == Decimal("100")

    @pytest.mark.asyncio
    async def test_overall_occupancy_rate(self):
        pm = PropertyMetrics(
            revenue=Decimal("3000"),
            booked_nights=15,
            vacancy_days=15,
            total_bookings=5,
            avg_stay_duration=Decimal("3"),
        )
        repo = FakeAnalyticsRepository(metrics=[pm])
        svc = CalculateMetricsService(repo, FakePropertyCostsRepository())

        result = await svc.execute(
            CalculateMetricsInput(
                company_id=COMPANY_ID,
                date_from=date(2025, 1, 1),
                date_to=date(2025, 1, 31),
            )
        )

        # Occupancy = 15 / (15+15) * 100 = 50%
        assert result.summary.overall_occupancy_rate == Decimal("50")

    @pytest.mark.asyncio
    async def test_avg_stay_duration_weighted(self):
        pm1 = PropertyMetrics(
            revenue=Decimal("1000"),
            booked_nights=6,
            vacancy_days=24,
            total_bookings=2,
            avg_stay_duration=Decimal("3"),  # 2 bookings * 3 nights
        )
        pm2 = PropertyMetrics(
            revenue=Decimal("2000"),
            booked_nights=9,
            vacancy_days=21,
            total_bookings=3,
            avg_stay_duration=Decimal("3"),  # 3 bookings * 3 nights
        )
        repo = FakeAnalyticsRepository(metrics=[pm1, pm2])
        svc = CalculateMetricsService(repo, FakePropertyCostsRepository())

        result = await svc.execute(
            CalculateMetricsInput(
                company_id=COMPANY_ID,
                date_from=date(2025, 1, 1),
                date_to=date(2025, 1, 31),
            )
        )

        # Weighted avg: (3*2 + 3*3) / (2+3) = 15/5 = 3
        assert result.summary.avg_stay_duration == Decimal("3")

    @pytest.mark.asyncio
    async def test_date_validation_rejects_invalid_range(self):
        repo = FakeAnalyticsRepository()
        svc = CalculateMetricsService(repo, FakePropertyCostsRepository())

        with pytest.raises(ValueError, match="date_to must be after date_from"):
            await svc.execute(
                CalculateMetricsInput(
                    company_id=COMPANY_ID,
                    date_from=date(2025, 6, 1),
                    date_to=date(2025, 1, 1),
                )
            )

    @pytest.mark.asyncio
    async def test_date_validation_rejects_same_dates(self):
        repo = FakeAnalyticsRepository()
        svc = CalculateMetricsService(repo, FakePropertyCostsRepository())

        with pytest.raises(ValueError, match="date_to must be after date_from"):
            await svc.execute(
                CalculateMetricsInput(
                    company_id=COMPANY_ID,
                    date_from=date(2025, 6, 1),
                    date_to=date(2025, 6, 1),
                )
            )

    @pytest.mark.asyncio
    async def test_filter_by_property_id(self):
        pid1 = uuid.uuid4()
        pid2 = uuid.uuid4()
        pm1 = PropertyMetrics(
            property_id=pid1, revenue=Decimal("1000"), total_bookings=1,
            booked_nights=3, vacancy_days=27, avg_stay_duration=Decimal("3"),
        )
        pm2 = PropertyMetrics(
            property_id=pid2, revenue=Decimal("2000"), total_bookings=2,
            booked_nights=6, vacancy_days=24, avg_stay_duration=Decimal("3"),
        )
        repo = FakeAnalyticsRepository(metrics=[pm1, pm2])
        svc = CalculateMetricsService(repo, FakePropertyCostsRepository())

        result = await svc.execute(
            CalculateMetricsInput(
                company_id=COMPANY_ID,
                date_from=date(2025, 1, 1),
                date_to=date(2025, 1, 31),
                property_ids=[pid1],
            )
        )

        assert len(result.properties) == 1
        assert result.properties[0].property_id == pid1
        assert result.summary.total_revenue == Decimal("1000")

    @pytest.mark.asyncio
    async def test_zero_booked_nights_adr_is_zero(self):
        pm = PropertyMetrics(
            revenue=Decimal("0"),
            booked_nights=0,
            vacancy_days=30,
            total_bookings=0,
            avg_stay_duration=Decimal("0"),
        )
        repo = FakeAnalyticsRepository(metrics=[pm])
        svc = CalculateMetricsService(repo, FakePropertyCostsRepository())

        result = await svc.execute(
            CalculateMetricsInput(
                company_id=COMPANY_ID,
                date_from=date(2025, 1, 1),
                date_to=date(2025, 1, 31),
            )
        )

        assert result.summary.overall_adr == Decimal("0")


# ---------- GetTimeSeriesService ----------


class TestGetTimeSeriesService:
    @pytest.mark.asyncio
    async def test_returns_time_series_points(self):
        points = [
            TimeSeriesPoint(
                period_start=date(2025, 1, 1),
                period_label="Jan 01",
                revenue=Decimal("500"),
                bookings_count=2,
                booked_nights=3,
                occupancy_rate=Decimal("100"),
            ),
            TimeSeriesPoint(
                period_start=date(2025, 1, 2),
                period_label="Jan 02",
                revenue=Decimal("300"),
                bookings_count=1,
                booked_nights=1,
                occupancy_rate=Decimal("100"),
            ),
        ]
        repo = FakeAnalyticsRepository(time_series=points)
        svc = GetTimeSeriesService(repo)

        result = await svc.execute(
            GetTimeSeriesInput(
                company_id=COMPANY_ID,
                date_from=date(2025, 1, 1),
                date_to=date(2025, 1, 3),
                granularity=Granularity.DAY,
            )
        )

        assert len(result) == 2
        assert result[0].revenue == Decimal("500")
        assert result[1].revenue == Decimal("300")

    @pytest.mark.asyncio
    async def test_empty_time_series(self):
        repo = FakeAnalyticsRepository(time_series=[])
        svc = GetTimeSeriesService(repo)

        result = await svc.execute(
            GetTimeSeriesInput(
                company_id=COMPANY_ID,
                date_from=date(2025, 1, 1),
                date_to=date(2025, 1, 7),
            )
        )

        assert result == []

    @pytest.mark.asyncio
    async def test_date_validation_rejects_invalid_range(self):
        repo = FakeAnalyticsRepository()
        svc = GetTimeSeriesService(repo)

        with pytest.raises(ValueError, match="date_to must be after date_from"):
            await svc.execute(
                GetTimeSeriesInput(
                    company_id=COMPANY_ID,
                    date_from=date(2025, 12, 1),
                    date_to=date(2025, 1, 1),
                )
            )

    @pytest.mark.asyncio
    async def test_default_granularity_is_day(self):
        inp = GetTimeSeriesInput(
            company_id=COMPANY_ID,
            date_from=date(2025, 1, 1),
            date_to=date(2025, 1, 7),
        )
        assert inp.granularity == Granularity.DAY

    @pytest.mark.asyncio
    async def test_granularity_week(self):
        repo = FakeAnalyticsRepository(time_series=[])
        svc = GetTimeSeriesService(repo)

        result = await svc.execute(
            GetTimeSeriesInput(
                company_id=COMPANY_ID,
                date_from=date(2025, 1, 1),
                date_to=date(2025, 1, 31),
                granularity=Granularity.WEEK,
            )
        )

        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_granularity_month(self):
        repo = FakeAnalyticsRepository(time_series=[])
        svc = GetTimeSeriesService(repo)

        result = await svc.execute(
            GetTimeSeriesInput(
                company_id=COMPANY_ID,
                date_from=date(2025, 1, 1),
                date_to=date(2025, 12, 31),
                granularity=Granularity.MONTH,
            )
        )

        assert isinstance(result, list)


class TestCostsReachTheReport:
    """Profit used to be revenue minus the OTA commission.

    For a subletter that number is not profit at all: the rent they pay the
    flat's owner is their largest outgoing and none of it was counted. Someone
    reading that screen would see a good month and be in the red.
    """

    def _metrics(self, revenue="600000", bookings=10, nights="20"):
        return PropertyMetrics(
            property_id=PROPERTY_ID,
            revenue=Decimal(revenue),
            total_bookings=bookings,
            booked_nights=Decimal(nights),
            commission=Decimal("30000"),
        )

    def _costs(self):
        return PropertyCosts(
            property_id=PROPERTY_ID,
            monthly_rent=Decimal("300000"),
            monthly_utilities=Decimal("15000"),
            cleaning_cost=Decimal("4000"),
            consumables_per_night=Decimal("500"),
        )

    async def _run(self, costs_repo):
        svc = CalculateMetricsService(
            FakeAnalyticsRepository([self._metrics()]), costs_repo
        )
        return await svc.execute(
            CalculateMetricsInput(
                company_id=COMPANY_ID,
                date_from=date(2026, 8, 1),
                date_to=date(2026, 8, 31),
            )
        )

    @pytest.mark.asyncio
    async def test_rent_and_utilities_land_in_the_fixed_costs(self):
        result = await self._run(FakePropertyCostsRepository({PROPERTY_ID: self._costs()}))
        pm = result.properties[0]

        # 30 days of a 315 000 ₸ month, prorated across the year.
        assert Decimal(300000) < pm.fixed_costs < Decimal(325000)

    @pytest.mark.asyncio
    async def test_cleaning_is_charged_per_stay_and_consumables_per_night(self):
        result = await self._run(FakePropertyCostsRepository({PROPERTY_ID: self._costs()}))

        # 10 stays × 4 000 + 20 nights × 500
        assert result.properties[0].variable_costs == Decimal("50000")

    @pytest.mark.asyncio
    async def test_profit_is_what_is_left_after_all_of_it(self):
        result = await self._run(FakePropertyCostsRepository({PROPERTY_ID: self._costs()}))
        pm = result.properties[0]

        assert pm.expenses == pm.commission + pm.fixed_costs + pm.variable_costs
        assert pm.profit == pm.revenue - pm.expenses

    @pytest.mark.asyncio
    async def test_the_old_number_was_larger_by_the_whole_rent(self):
        # The point of the change, stated as a test: a month that looked like
        # 570 000 ₸ of profit is closer to 210 000 ₸.
        with_costs = await self._run(FakePropertyCostsRepository({PROPERTY_ID: self._costs()}))
        without = await self._run(FakePropertyCostsRepository())

        assert without.properties[0].profit > with_costs.properties[0].profit
        assert without.properties[0].profit == Decimal("570000")

    @pytest.mark.asyncio
    async def test_a_flat_with_no_costs_recorded_still_reports(self):
        # Costs are opt-in per flat. A report that refuses to render is worse
        # than one that is incomplete for the flats nobody configured yet.
        result = await self._run(FakePropertyCostsRepository())
        pm = result.properties[0]

        assert pm.fixed_costs == Decimal("0")
        assert pm.expenses == pm.commission

    @pytest.mark.asyncio
    async def test_the_summary_carries_the_same_split(self):
        result = await self._run(FakePropertyCostsRepository({PROPERTY_ID: self._costs()}))

        assert result.summary.total_fixed_costs == result.properties[0].fixed_costs
        assert result.summary.total_variable_costs == result.properties[0].variable_costs
        assert result.summary.total_profit == result.properties[0].profit
