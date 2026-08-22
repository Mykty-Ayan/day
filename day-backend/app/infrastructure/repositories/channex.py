from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.channex.entities import (
    ChannexBookingEvent,
    ChannexConnection,
    ChannexListing,
)
from app.domain.channex.repositories import (
    ChannexBookingEventRepository,
    ChannexConnectionRepository,
    ChannexListingRepository,
)
from app.domain.channex.value_objects import ChannexBookingStatus, ListingSyncState
from app.infrastructure.models.channex import (
    ChannexBookingEventModel,
    ChannexConnectionModel,
    ChannexListingModel,
)


def _model_to_connection(m: ChannexConnectionModel) -> ChannexConnection:
    return ChannexConnection(
        id=m.id,
        company_id=m.company_id,
        channex_group_id=m.channex_group_id,
        is_active=m.is_active,
        created_at=m.created_at,
    )


def _model_to_listing(m: ChannexListingModel) -> ChannexListing:
    return ChannexListing(
        id=m.id,
        company_id=m.company_id,
        property_id=m.property_id,
        channex_property_id=m.channex_property_id,
        channex_room_type_id=m.channex_room_type_id,
        channex_rate_plan_id=m.channex_rate_plan_id,
        sync_state=ListingSyncState(m.sync_state),
        last_error=m.last_error,
        last_synced_at=m.last_synced_at,
        created_at=m.created_at,
    )


def _model_to_event(m: ChannexBookingEventModel) -> ChannexBookingEvent:
    return ChannexBookingEvent(
        id=m.id,
        company_id=m.company_id,
        property_id=m.property_id,
        booking_id=m.booking_id,
        revision_id=m.revision_id,
        channex_booking_id=m.channex_booking_id,
        unique_id=m.unique_id,
        ota_name=m.ota_name,
        status=ChannexBookingStatus(m.status),
        payload=m.payload or {},
        acked_at=m.acked_at,
        created_at=m.created_at,
    )


class SqlChannexConnectionRepository(ChannexConnectionRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_company(self, company_id: uuid.UUID) -> ChannexConnection | None:
        result = await self._session.execute(
            select(ChannexConnectionModel).where(ChannexConnectionModel.company_id == company_id)
        )
        model = result.scalar_one_or_none()
        return _model_to_connection(model) if model else None

    async def save(self, connection: ChannexConnection) -> ChannexConnection:
        model = ChannexConnectionModel(
            id=connection.id,
            company_id=connection.company_id,
            channex_group_id=connection.channex_group_id,
            is_active=connection.is_active,
        )
        self._session.add(model)
        await self._session.flush()
        return _model_to_connection(model)


class SqlChannexListingRepository(ChannexListingRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, listing: ChannexListing) -> ChannexListing:
        model = ChannexListingModel(
            id=listing.id,
            company_id=listing.company_id,
            property_id=listing.property_id,
            channex_property_id=listing.channex_property_id,
            channex_room_type_id=listing.channex_room_type_id,
            channex_rate_plan_id=listing.channex_rate_plan_id,
            sync_state=listing.sync_state.value,
            last_error=listing.last_error,
            last_synced_at=listing.last_synced_at,
        )
        self._session.add(model)
        await self._session.flush()
        return _model_to_listing(model)

    async def get_by_property(self, property_id: uuid.UUID) -> ChannexListing | None:
        result = await self._session.execute(
            select(ChannexListingModel).where(ChannexListingModel.property_id == property_id)
        )
        model = result.scalar_one_or_none()
        return _model_to_listing(model) if model else None

    async def get_by_channex_property(self, channex_property_id: str) -> ChannexListing | None:
        result = await self._session.execute(
            select(ChannexListingModel).where(
                ChannexListingModel.channex_property_id == channex_property_id
            )
        )
        model = result.scalar_one_or_none()
        return _model_to_listing(model) if model else None

    async def list_by_company(self, company_id: uuid.UUID) -> list[ChannexListing]:
        result = await self._session.execute(
            select(ChannexListingModel)
            .where(ChannexListingModel.company_id == company_id)
            .order_by(ChannexListingModel.created_at)
        )
        return [_model_to_listing(m) for m in result.scalars().all()]

    async def update(self, listing: ChannexListing) -> ChannexListing:
        result = await self._session.execute(
            select(ChannexListingModel).where(ChannexListingModel.id == listing.id)
        )
        model = result.scalar_one()
        model.channex_property_id = listing.channex_property_id
        model.channex_room_type_id = listing.channex_room_type_id
        model.channex_rate_plan_id = listing.channex_rate_plan_id
        model.sync_state = listing.sync_state.value
        model.last_error = listing.last_error
        model.last_synced_at = listing.last_synced_at
        await self._session.flush()
        return _model_to_listing(model)


class SqlChannexBookingEventRepository(ChannexBookingEventRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def exists_revision(self, company_id: uuid.UUID, revision_id: str) -> bool:
        result = await self._session.execute(
            select(ChannexBookingEventModel.id).where(
                ChannexBookingEventModel.company_id == company_id,
                ChannexBookingEventModel.revision_id == revision_id,
            )
        )
        return result.scalar_one_or_none() is not None

    async def get_latest_by_unique_id(
        self, company_id: uuid.UUID, unique_id: str
    ) -> ChannexBookingEvent | None:
        result = await self._session.execute(
            select(ChannexBookingEventModel)
            .where(
                ChannexBookingEventModel.company_id == company_id,
                ChannexBookingEventModel.unique_id == unique_id,
            )
            .order_by(ChannexBookingEventModel.created_at.desc())
            .limit(1)
        )
        model = result.scalars().first()
        return _model_to_event(model) if model else None

    async def save(self, event: ChannexBookingEvent) -> ChannexBookingEvent:
        model = ChannexBookingEventModel(
            id=event.id,
            company_id=event.company_id,
            property_id=event.property_id,
            booking_id=event.booking_id,
            revision_id=event.revision_id,
            channex_booking_id=event.channex_booking_id,
            unique_id=event.unique_id,
            ota_name=event.ota_name,
            status=event.status.value,
            payload=event.payload,
            acked_at=event.acked_at,
        )
        self._session.add(model)
        await self._session.flush()
        return _model_to_event(model)
