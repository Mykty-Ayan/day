from __future__ import annotations

from datetime import date
from typing import Any, Protocol


class ChannexGatewayError(RuntimeError):
    """Channex API refused or failed a call."""


class ChannexGateway(Protocol):
    """Port to the Channex HTTP API; infrastructure provides the httpx client.

    All ids are Channex-side UUID strings. Rates travel as decimal strings
    ("45000.00") — Channex's own wire format.
    """

    async def create_group(self, title: str) -> str: ...

    async def create_property(
        self,
        *,
        group_id: str,
        title: str,
        currency: str,
        email: str,
        country: str,
        city: str,
        address: str,
        zip_code: str,
        timezone: str,
        latitude: str | None = None,
        longitude: str | None = None,
    ) -> str: ...

    async def create_room_type(
        self,
        *,
        property_id: str,
        title: str,
        occ_adults: int,
        occ_children: int,
        default_occupancy: int,
    ) -> str: ...

    async def create_rate_plan(
        self,
        *,
        property_id: str,
        room_type_id: str,
        title: str,
        currency: str,
        max_occupancy: int,
    ) -> str: ...

    async def update_availability(
        self,
        *,
        property_id: str,
        room_type_id: str,
        date_from: date,
        date_to: date,
        availability: int,
    ) -> None: ...

    async def update_restrictions(
        self,
        *,
        property_id: str,
        rate_plan_id: str,
        date_from: date,
        date_to: date,
        rate: str | None = None,
        min_stay_arrival: int | None = None,
    ) -> None: ...

    async def get_booking_revisions_feed(self, *, property_id: str) -> list[dict[str, Any]]: ...

    async def ack_booking_revision(self, revision_id: str) -> None: ...
