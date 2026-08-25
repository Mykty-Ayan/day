"""httpx implementation of the Channex gateway.

Wire format quirks worth knowing:

* Auth is a bare ``user-api-key`` header.
* ARI updates are async on the Channex side — the API answers with task ids
  and applies the change within seconds; we treat the 200 as done.
* ``date_to`` in ARI payloads is inclusive.
* Rates are decimal strings ("45000.00").
"""

from __future__ import annotations

from datetime import date
from typing import Any

import httpx

from app.config import settings
from app.domain.channex.gateway import ChannexGatewayError

_TIMEOUT = httpx.Timeout(20.0, connect=5.0)


class HttpChannexGateway:
    def __init__(self, base_url: str | None = None, api_key: str | None = None) -> None:
        self._base_url = (base_url or settings.CHANNEX_API_URL).rstrip("/")
        self._api_key = api_key or settings.CHANNEX_API_KEY

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    async def _request(self, method: str, path: str, json: dict | None = None) -> dict[str, Any]:
        if not self.is_configured:
            raise ChannexGatewayError("Channex is not configured (CHANNEX_API_KEY is empty)")
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            try:
                response = await client.request(
                    method,
                    f"{self._base_url}/api/v1{path}",
                    json=json,
                    headers={"user-api-key": self._api_key},
                )
            except httpx.HTTPError as exc:
                raise ChannexGatewayError(f"Channex request failed: {exc}") from exc
        if response.status_code >= 400:
            raise ChannexGatewayError(
                f"Channex {method} {path} -> {response.status_code}: {response.text[:500]}"
            )
        if not response.content:
            return {}
        return response.json()

    async def create_group(self, title: str) -> str:
        data = await self._request("POST", "/groups", {"group": {"title": title}})
        return str(data["data"]["id"])

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
    ) -> str:
        payload: dict[str, Any] = {
            "title": title,
            "currency": currency,
            "email": email,
            "country": country,
            "city": city,
            "address": address,
            "zip_code": zip_code,
            "timezone": timezone,
            "property_type": "apartment",
            "group_id": group_id,
            "settings": {
                "allow_availability_autoupdate_on_confirmation": True,
                "allow_availability_autoupdate_on_modification": True,
                "allow_availability_autoupdate_on_cancellation": True,
                "min_stay_type": "both",
                "state_length": 365,
            },
        }
        if latitude is not None:
            payload["latitude"] = latitude
        if longitude is not None:
            payload["longitude"] = longitude
        data = await self._request("POST", "/properties", {"property": payload})
        return str(data["data"]["id"])

    async def create_room_type(
        self,
        *,
        property_id: str,
        title: str,
        occ_adults: int,
        occ_children: int,
        default_occupancy: int,
    ) -> str:
        data = await self._request(
            "POST",
            "/room_types",
            {
                "room_type": {
                    "property_id": property_id,
                    "title": title,
                    "count_of_rooms": 1,
                    "occ_adults": occ_adults,
                    "occ_children": occ_children,
                    "occ_infants": 0,
                    "default_occupancy": default_occupancy,
                    "room_kind": "room",
                }
            },
        )
        return str(data["data"]["id"])

    async def create_rate_plan(
        self,
        *,
        property_id: str,
        room_type_id: str,
        title: str,
        currency: str,
        max_occupancy: int,
    ) -> str:
        data = await self._request(
            "POST",
            "/rate_plans",
            {
                "rate_plan": {
                    "property_id": property_id,
                    "room_type_id": room_type_id,
                    "title": title,
                    "sell_mode": "per_room",
                    "rate_mode": "manual",
                    "currency": currency,
                    "options": [{"occupancy": max_occupancy, "is_primary": True, "rate": 0}],
                }
            },
        )
        return str(data["data"]["id"])

    async def update_availability(
        self,
        *,
        property_id: str,
        room_type_id: str,
        date_from: date,
        date_to: date,
        availability: int,
    ) -> None:
        await self._request(
            "POST",
            "/availability",
            {
                "values": [
                    {
                        "property_id": property_id,
                        "room_type_id": room_type_id,
                        "date_from": date_from.isoformat(),
                        "date_to": date_to.isoformat(),
                        "availability": availability,
                    }
                ]
            },
        )

    async def update_restrictions(
        self,
        *,
        property_id: str,
        rate_plan_id: str,
        date_from: date,
        date_to: date,
        rate: str | None = None,
        min_stay_arrival: int | None = None,
    ) -> None:
        value: dict[str, Any] = {
            "property_id": property_id,
            "rate_plan_id": rate_plan_id,
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
        }
        if rate is not None:
            value["rate"] = rate
        if min_stay_arrival is not None:
            value["min_stay_arrival"] = min_stay_arrival
        await self._request("POST", "/restrictions", {"values": [value]})

    async def get_booking_revisions_feed(self, *, property_id: str) -> list[dict[str, Any]]:
        data = await self._request(
            "GET", f"/booking_revisions/feed?filter[property_id]={property_id}"
        )
        return list(data.get("data") or [])

    async def ack_booking_revision(self, revision_id: str) -> None:
        await self._request("POST", f"/booking_revisions/{revision_id}/ack")
