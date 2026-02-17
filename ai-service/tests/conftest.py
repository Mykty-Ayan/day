from __future__ import annotations

import pytest

from app.domain.entities import ExtractedProperty
from app.domain.services import ContentParser, DataExtractor, PropertyDataMapper
from app.domain.value_objects import SourceType


class FakeParser(ContentParser):
    """In-memory fake parser for testing."""

    def __init__(self, content: str = "fake content", source_type: SourceType = SourceType.OTHER) -> None:
        self._content = content
        self._source_type = source_type

    async def fetch_content(self, url: str) -> str:
        return self._content

    def get_source_type(self) -> SourceType:
        return self._source_type


class FailingParser(ContentParser):
    """Parser that always raises an error."""

    async def fetch_content(self, url: str) -> str:
        raise ConnectionError("Network error")

    def get_source_type(self) -> SourceType:
        return SourceType.OTHER


class FakeExtractor(DataExtractor):
    """In-memory fake extractor for testing."""

    def __init__(self, result: dict | None = None) -> None:
        self._result = result or {}

    async def extract(self, content: str, source_type: SourceType, user_prompt: str | None = None) -> dict:
        return self._result


class FailingExtractor(DataExtractor):
    """Extractor that always raises an error."""

    async def extract(self, content: str, source_type: SourceType, user_prompt: str | None = None) -> dict:
        raise RuntimeError("LLM API error")


class FakeMapper(PropertyDataMapper):
    """In-memory fake mapper for testing."""

    def __init__(self, confidence: float = 0.5) -> None:
        self._confidence = confidence

    def map_to_property(self, raw_data: dict, source_url: str, source_type: SourceType) -> ExtractedProperty:
        return ExtractedProperty(
            name=raw_data.get("name"),
            source_url=source_url,
        )

    def calculate_confidence(self, property_data: ExtractedProperty) -> float:
        return self._confidence


@pytest.fixture
def sample_raw_data() -> dict:
    """Sample raw extraction data for testing."""
    return {
        "name": "Cozy Studio Apartment",
        "type": "apartment",
        "description": "A beautiful studio in the city center",
        "address_full": "123 Main Street, Almaty",
        "rooms": 2,
        "beds": 1,
        "area_total": 45.5,
        "area_living": 30.0,
        "floor": 3,
        "base_price": 25000.0,
        "amenities": ["WiFi", "Kitchen", "Washer"],
        "photos": ["https://example.com/photo1.jpg", "https://example.com/photo2.jpg"],
        "latitude": 43.238949,
        "longitude": 76.945465,
        "check_in_instructions": "Ring the bell at entrance",
        "check_out_instructions": "Leave keys on the table",
        "house_rules": "No smoking. No parties.",
    }


@pytest.fixture
def sample_extracted_property() -> ExtractedProperty:
    """Sample extracted property entity for testing."""
    return ExtractedProperty(
        name="Cozy Studio Apartment",
        internal_name="cozy-studio-apartment",
        type="apartment",
        description="A beautiful studio in the city center",
        source_url="https://booking.com/hotel/test",
        latitude=43.238949,
        longitude=76.945465,
        address_full="123 Main Street, Almaty",
        rooms=2,
        beds=1,
        area_total=45.5,
        area_living=30.0,
        floor=3,
        check_in_instructions="Ring the bell at entrance",
        check_out_instructions="Leave keys on the table",
        house_rules="No smoking. No parties.",
        amenities=["WiFi", "Kitchen", "Washer"],
        base_price=25000.0,
        photos=["https://example.com/photo1.jpg", "https://example.com/photo2.jpg"],
    )
