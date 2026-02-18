from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.domain.entities import ExtractedProperty, ParseResult
from app.domain.value_objects import SourceType
from app.presentation.api.v1 import parse as parse_api
from app.presentation.schemas.parse import ParseRequest


class _FakeEnricher:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    async def enrich(self, source_url: str) -> dict:
        return self._payload


class _FailingEnricher:
    async def enrich(self, source_url: str) -> dict:
        raise RuntimeError("mcp unavailable")


class TestParseApiMCP:
    @pytest.mark.asyncio
    async def test_applies_airbnb_mcp_enrichment_when_available(self):
        parse_result = ParseResult(
            source_url="https://www.airbnb.com/rooms/50530162",
            source_type=SourceType.AIRBNB,
            raw_data={},
            property_data=ExtractedProperty(source_url="https://www.airbnb.com/rooms/50530162"),
            confidence=0.0,
            warnings=[],
        )
        mcp_payload = {
            "airbnb_listing_id": "50530162",
            "name": "MCP Name",
            "latitude": 43.2,
            "longitude": 76.9,
            "amenities": ["WiFi"],
        }

        with (
            patch.object(parse_api.ParseListingService, "execute", AsyncMock(return_value=parse_result)),
            patch.object(parse_api, "_AIRBNB_MCP_ENRICHER", _FakeEnricher(mcp_payload)),
        ):
            response = await parse_api.parse_listing(ParseRequest(url="https://www.airbnb.com/rooms/50530162"))

        assert response.raw_data["airbnb_listing_id"] == "50530162"
        assert response.raw_data["name"] == "MCP Name"
        assert response.raw_data["latitude"] == 43.2
        assert response.property_data.name == "MCP Name"
        assert response.property_data.latitude == 43.2
        assert response.confidence > 0

    @pytest.mark.asyncio
    async def test_adds_warning_when_airbnb_mcp_enrichment_fails(self):
        parse_result = ParseResult(
            source_url="https://www.airbnb.com/rooms/50530162",
            source_type=SourceType.AIRBNB,
            raw_data={},
            property_data=ExtractedProperty(source_url="https://www.airbnb.com/rooms/50530162"),
            confidence=0.0,
            warnings=[],
        )

        with (
            patch.object(parse_api.ParseListingService, "execute", AsyncMock(return_value=parse_result)),
            patch.object(parse_api, "_AIRBNB_MCP_ENRICHER", _FailingEnricher()),
        ):
            response = await parse_api.parse_listing(ParseRequest(url="https://www.airbnb.com/rooms/50530162"))

        assert any("Airbnb MCP enrichment failed" in warning for warning in response.warnings)
