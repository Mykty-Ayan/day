from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from app.domain.channex.entities import ChannexConnection, ChannexListing
from app.domain.channex.gateway import ChannexGateway, ChannexGatewayError
from app.domain.channex.repositories import (
    ChannexConnectionRepository,
    ChannexListingRepository,
)
from app.domain.channex.value_objects import ListingSyncState
from app.domain.property.repositories import PropertyRepository


@dataclass
class OnboardListingInput:
    company_id: uuid.UUID
    property_id: uuid.UUID
    currency: str = "KZT"
    country: str = "KZ"
    city: str = ""
    zip_code: str = ""
    timezone: str = "Asia/Almaty"
    contact_email: str = ""
    group_title: str | None = None


class OnboardListingService:
    """Mirror a property into Channex as property + room type + rate plan.

    An apartment is one sellable unit: room type has count_of_rooms=1 and the
    rate plan sells per_room, so channel availability is a 0/1 flag per date.
    """

    def __init__(
        self,
        connection_repo: ChannexConnectionRepository,
        listing_repo: ChannexListingRepository,
        property_repo: PropertyRepository,
        gateway: ChannexGateway,
    ) -> None:
        self._connections = connection_repo
        self._listings = listing_repo
        self._properties = property_repo
        self._gateway = gateway

    async def execute(self, inp: OnboardListingInput) -> ChannexListing:
        prop = await self._properties.get_by_id(inp.property_id)
        if prop is None or prop.company_id != inp.company_id:
            raise ValueError("Property not found")

        existing = await self._listings.get_by_property(inp.property_id)
        if existing is not None:
            return existing

        connection = await self._connections.get_by_company(inp.company_id)
        if connection is None:
            group_id = await self._gateway.create_group(
                inp.group_title or f"company-{inp.company_id}"
            )
            connection = await self._connections.save(
                ChannexConnection(company_id=inp.company_id, channex_group_id=group_id)
            )

        adults = max(prop.beds or 2, 1)
        listing = ChannexListing(
            company_id=inp.company_id,
            property_id=inp.property_id,
            sync_state=ListingSyncState.PENDING,
        )
        try:
            listing.channex_property_id = await self._gateway.create_property(
                group_id=connection.channex_group_id,
                title=prop.name or prop.internal_name,
                currency=inp.currency,
                email=inp.contact_email,
                country=inp.country,
                city=inp.city,
                address=prop.address_full or "",
                zip_code=inp.zip_code,
                timezone=inp.timezone,
                latitude=str(prop.latitude) if prop.latitude is not None else None,
                longitude=str(prop.longitude) if prop.longitude is not None else None,
            )
            listing.channex_room_type_id = await self._gateway.create_room_type(
                property_id=listing.channex_property_id,
                title="Entire apartment",
                occ_adults=adults,
                occ_children=0,
                default_occupancy=min(2, adults),
            )
            listing.channex_rate_plan_id = await self._gateway.create_rate_plan(
                property_id=listing.channex_property_id,
                room_type_id=listing.channex_room_type_id,
                title="Standard Rate",
                currency=inp.currency,
                max_occupancy=adults,
            )
            listing.sync_state = ListingSyncState.ACTIVE
            listing.last_synced_at = datetime.utcnow()
        except ChannexGatewayError as exc:
            # A half-created listing is kept so the ids that did succeed are
            # not orphaned on the Channex side; retry continues from the error.
            listing.sync_state = ListingSyncState.ERROR
            listing.last_error = str(exc)

        return await self._listings.create(listing)
