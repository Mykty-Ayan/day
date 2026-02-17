"""Unit tests for ParseListingService application use case."""

from __future__ import annotations

import pytest

from app.application.parse_listing import ParseListingInput, ParseListingService
from app.domain.value_objects import SourceType
from tests.conftest import FailingExtractor, FailingParser, FakeExtractor, FakeMapper, FakeParser


class TestParseListingService:
    @pytest.mark.asyncio
    async def test_successful_parse(self):
        raw = {"name": "Test Property", "type": "apartment"}
        parser = FakeParser(content="listing content", source_type=SourceType.BOOKING)
        extractor = FakeExtractor(result=raw)
        mapper = FakeMapper(confidence=0.75)

        service = ParseListingService(
            parser_factory=lambda st: parser,
            extractor=extractor,
            mapper=mapper,
        )

        result = await service.execute(ParseListingInput(url="https://www.booking.com/hotel/test"))

        assert result.source_url == "https://www.booking.com/hotel/test"
        assert result.source_type == SourceType.BOOKING
        assert result.raw_data == raw
        assert result.confidence == 0.75
        assert result.warnings == []
        assert result.property_data.name == "Test Property"

    @pytest.mark.asyncio
    async def test_source_type_detection_airbnb(self):
        service = ParseListingService(
            parser_factory=lambda st: FakeParser(source_type=st),
            extractor=FakeExtractor(),
            mapper=FakeMapper(),
        )

        result = await service.execute(ParseListingInput(url="https://www.airbnb.com/rooms/12345"))

        assert result.source_type == SourceType.AIRBNB

    @pytest.mark.asyncio
    async def test_source_type_detection_krisha(self):
        service = ParseListingService(
            parser_factory=lambda st: FakeParser(source_type=st),
            extractor=FakeExtractor(),
            mapper=FakeMapper(),
        )

        result = await service.execute(ParseListingInput(url="https://krisha.kz/a/show/67890"))

        assert result.source_type == SourceType.KRISHA

    @pytest.mark.asyncio
    async def test_source_type_detection_other(self):
        service = ParseListingService(
            parser_factory=lambda st: FakeParser(source_type=st),
            extractor=FakeExtractor(),
            mapper=FakeMapper(),
        )

        result = await service.execute(ParseListingInput(url="https://example.com/property/123"))

        assert result.source_type == SourceType.OTHER

    @pytest.mark.asyncio
    async def test_fetch_failure_raises_value_error(self):
        service = ParseListingService(
            parser_factory=lambda st: FailingParser(),
            extractor=FakeExtractor(),
            mapper=FakeMapper(),
        )

        with pytest.raises(ValueError, match="Failed to fetch listing"):
            await service.execute(ParseListingInput(url="https://example.com/property/123"))

    @pytest.mark.asyncio
    async def test_extractor_failure_adds_warning(self):
        service = ParseListingService(
            parser_factory=lambda st: FakeParser(),
            extractor=FailingExtractor(),
            mapper=FakeMapper(),
        )

        result = await service.execute(ParseListingInput(url="https://example.com/property/123"))

        # Should not raise; instead adds a warning
        assert len(result.warnings) == 1
        assert "LLM extraction failed" in result.warnings[0]
        assert result.raw_data == {}

    @pytest.mark.asyncio
    async def test_user_prompt_passed_through(self):
        """Verify that user_prompt is accepted and doesn't break flow."""
        service = ParseListingService(
            parser_factory=lambda st: FakeParser(),
            extractor=FakeExtractor(result={"name": "Prompted Result"}),
            mapper=FakeMapper(),
        )

        result = await service.execute(
            ParseListingInput(
                url="https://example.com/property/123",
                user_prompt="Focus on price info",
            )
        )

        assert result.property_data.name == "Prompted Result"

    @pytest.mark.asyncio
    async def test_empty_extraction_produces_empty_property(self):
        service = ParseListingService(
            parser_factory=lambda st: FakeParser(),
            extractor=FakeExtractor(result={}),
            mapper=FakeMapper(confidence=0.0),
        )

        result = await service.execute(ParseListingInput(url="https://example.com/property/123"))

        assert result.confidence == 0.0
        assert result.raw_data == {}
