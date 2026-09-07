"""Assembling what a night costs and earns, out of what is already stored.

`suggest_price` takes an `Economics` and does not care where it came from. This
is where it comes from: the flat's own recorded costs, and its RevPAR over a
trailing window of real bookings.

Both halves are allowed to be missing, and they mean different things when they
are. No costs recorded means the floor is zero — nothing is known to be lost by
selling cheap, which is a statement about our records, not about the flat. No
RevPAR means too little history to aim at, and the late-night rule falls back to
a plain cut instead of inventing a target.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

from app.domain.analytics.repositories import AnalyticsRepository
from app.domain.pricing.value_objects import Economics
from app.domain.property.repositories import PropertyCostsRepository

#: Long enough to average out a bad week, short enough that a change of season
#: or of price is not still being averaged in months later.
TRAILING_DAYS = 90

#: Below this many nights actually sold, RevPAR is one lucky booking divided by
#: ninety and would be read as if it meant something.
_MIN_NIGHTS_FOR_REVPAR = 5


class BuildEconomicsService:
    def __init__(
        self,
        costs_repo: PropertyCostsRepository,
        analytics_repo: AnalyticsRepository,
    ) -> None:
        self._costs = costs_repo
        self._analytics = analytics_repo

    async def execute(
        self,
        company_id: uuid.UUID,
        property_id: uuid.UUID,
        nights: int = 1,
        today: date | None = None,
    ) -> Economics:
        today = today or date.today()
        costs = await self._costs.get_by_property(property_id)
        marginal = costs.marginal_cost(nights) if costs else Decimal("0")

        return Economics(
            marginal_cost=marginal,
            revpar=await self._revpar(company_id, property_id, today),
        )

    async def _revpar(
        self, company_id: uuid.UUID, property_id: uuid.UUID, today: date
    ) -> Decimal | None:
        metrics = await self._analytics.get_property_metrics(
            company_id,
            today - timedelta(days=TRAILING_DAYS),
            today,
            property_ids=[property_id],
        )
        for pm in metrics:
            if pm.property_id != property_id:
                continue
            if pm.booked_nights < _MIN_NIGHTS_FOR_REVPAR:
                return None
            return pm.revpar
        return None
