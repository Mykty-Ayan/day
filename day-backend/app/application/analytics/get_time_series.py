"""Use case: Get time-series analytics data."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from app.domain.analytics.entities import TimeSeriesPoint
from app.domain.analytics.repositories import AnalyticsRepository
from app.domain.analytics.value_objects import Granularity


@dataclass
class GetTimeSeriesInput:
    company_id: uuid.UUID
    date_from: date
    date_to: date
    granularity: Granularity = Granularity.DAY
    property_id: uuid.UUID | None = None
    source: str | None = None


class GetTimeSeriesService:
    def __init__(self, analytics_repo: AnalyticsRepository) -> None:
        self._analytics_repo = analytics_repo

    async def execute(self, inp: GetTimeSeriesInput) -> list[TimeSeriesPoint]:
        if inp.date_to <= inp.date_from:
            raise ValueError("date_to must be after date_from")

        return await self._analytics_repo.get_time_series(
            inp.company_id,
            inp.date_from,
            inp.date_to,
            inp.granularity,
            property_id=inp.property_id,
            source=inp.source,
        )
