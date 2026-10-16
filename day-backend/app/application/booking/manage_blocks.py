"""Closing and opening a flat's nights without a booking."""

from __future__ import annotations

import uuid
from datetime import date

from app.application.booking.blocks import block_span, checkout_hour
from app.domain.booking.entities import PropertyBlock
from app.domain.booking.exceptions import BlockOverlapsBookingError
from app.domain.booking.repositories import BookingRepository
from app.domain.property.repositories import PropertyRepository


class ManageBlocksService:
    def __init__(self, booking_repo: BookingRepository, property_repo: PropertyRepository) -> None:
        self._bookings = booking_repo
        self._properties = property_repo

    async def _own(self, company_id: uuid.UUID, property_id: uuid.UUID):
        prop = await self._properties.get_by_id(property_id)
        if prop is None or prop.company_id != company_id:
            raise ValueError("Property not found")
        return prop

    async def create(
        self,
        company_id: uuid.UUID,
        property_id: uuid.UUID,
        start_date: date,
        end_date: date,
        *,
        reason: str | None = None,
        created_by: uuid.UUID | None = None,
    ) -> PropertyBlock:
        prop = await self._own(company_id, property_id)
        if end_date <= start_date:
            raise ValueError("end_date must be after start_date")
        # Under the calendar lock: a booking made at the same moment waits and sees the block.
        await self._bookings.lock_property_calendar(property_id)
        start, end = block_span(start_date, end_date, checkout_hour(prop))
        if await self._bookings.get_by_property_and_dates(property_id, start, end):
            raise BlockOverlapsBookingError()
        return await self._bookings.add_block(
            PropertyBlock(
                company_id=company_id,
                property_id=property_id,
                start_date=start_date,
                end_date=end_date,
                starts_at=start,
                ends_at=end,
                reason=reason,
                created_by=created_by,
            )
        )

    async def list(
        self, company_id: uuid.UUID, property_id: uuid.UUID, date_from: date, date_to: date
    ) -> list[PropertyBlock]:
        await self._own(company_id, property_id)
        return await self._bookings.list_blocks(property_id, date_from, date_to)

    async def delete(self, company_id: uuid.UUID, property_id: uuid.UUID, block_id: uuid.UUID) -> None:
        await self._own(company_id, property_id)
        block = await self._bookings.get_block(block_id)
        if block is None or block.property_id != property_id:
            raise ValueError("Block not found")
        await self._bookings.delete_block(block_id)
