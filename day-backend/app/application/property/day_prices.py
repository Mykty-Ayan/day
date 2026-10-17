"""Prices for chosen nights, set on the calendar as on Airbnb."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

from app.domain.property.entities import DayPrice
from app.domain.property.repositories import DayPriceRepository, PropertyRepository

# A year of nights at once, as far ahead as the calendar shows.
MAX_NIGHTS = 366


class ManageDayPricesService:
    def __init__(self, property_repo: PropertyRepository, day_price_repo: DayPriceRepository) -> None:
        self._properties = property_repo
        self._prices = day_price_repo

    async def _own(self, company_id: uuid.UUID, property_id: uuid.UUID) -> None:
        prop = await self._properties.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")

    @staticmethod
    def _nights(start_date: date, end_date: date) -> list[date]:
        """start_date is the first night, end_date the day after the last, as for a stay."""
        if end_date <= start_date:
            raise ValueError("end_date must be after start_date")
        count = (end_date - start_date).days
        if count > MAX_NIGHTS:
            raise ValueError(f"At most {MAX_NIGHTS} nights at once")
        return [start_date + timedelta(days=n) for n in range(count)]

    async def set(
        self, company_id: uuid.UUID, property_id: uuid.UUID, start_date: date, end_date: date, price: Decimal
    ) -> list[DayPrice]:
        await self._own(company_id, property_id)
        nights = self._nights(start_date, end_date)
        if price <= 0:
            raise ValueError("The price must be above zero")
        await self._prices.set_prices(company_id, property_id, nights, price)
        return [DayPrice(company_id=company_id, property_id=property_id, date=night, price=price) for night in nights]

    async def clear(self, company_id: uuid.UUID, property_id: uuid.UUID, start_date: date, end_date: date) -> None:
        """Back to the flat's usual price on those nights."""
        await self._own(company_id, property_id)
        self._nights(start_date, end_date)
        await self._prices.clear(property_id, start_date, end_date)

    async def list(
        self, company_id: uuid.UUID, property_id: uuid.UUID, date_from: date, date_to: date
    ) -> list[DayPrice]:
        await self._own(company_id, property_id)
        return await self._prices.list_for_property(property_id, date_from, date_to)
