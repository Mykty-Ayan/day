"""Analytics domain repository interfaces."""

from __future__ import annotations

import abc
import uuid
from datetime import date

from app.domain.analytics.entities import PropertyMetrics, TimeSeriesPoint
from app.domain.analytics.value_objects import Granularity


class AnalyticsRepository(abc.ABC):
    @abc.abstractmethod
    async def get_property_metrics(
        self,
        company_id: uuid.UUID,
        date_from: date,
        date_to: date,
        *,
        property_ids: list[uuid.UUID] | None = None,
        source: str | None = None,
    ) -> list[PropertyMetrics]:
        ...

    @abc.abstractmethod
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
        ...
