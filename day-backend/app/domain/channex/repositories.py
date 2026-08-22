from __future__ import annotations

import abc
import uuid

from app.domain.channex.entities import (
    ChannexBookingEvent,
    ChannexConnection,
    ChannexListing,
)


class ChannexConnectionRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_company(self, company_id: uuid.UUID) -> ChannexConnection | None: ...

    @abc.abstractmethod
    async def save(self, connection: ChannexConnection) -> ChannexConnection: ...


class ChannexListingRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, listing: ChannexListing) -> ChannexListing: ...

    @abc.abstractmethod
    async def get_by_property(self, property_id: uuid.UUID) -> ChannexListing | None: ...

    @abc.abstractmethod
    async def get_by_channex_property(self, channex_property_id: str) -> ChannexListing | None: ...

    @abc.abstractmethod
    async def list_by_company(self, company_id: uuid.UUID) -> list[ChannexListing]: ...

    @abc.abstractmethod
    async def update(self, listing: ChannexListing) -> ChannexListing: ...


class ChannexBookingEventRepository(abc.ABC):
    @abc.abstractmethod
    async def exists_revision(self, company_id: uuid.UUID, revision_id: str) -> bool: ...

    @abc.abstractmethod
    async def get_latest_by_unique_id(
        self, company_id: uuid.UUID, unique_id: str
    ) -> ChannexBookingEvent | None: ...

    @abc.abstractmethod
    async def save(self, event: ChannexBookingEvent) -> ChannexBookingEvent: ...
