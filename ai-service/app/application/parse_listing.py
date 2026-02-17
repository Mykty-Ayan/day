from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from app.domain.entities import ParseResult
from app.domain.services import ContentParser, DataExtractor, PropertyDataMapper
from app.domain.value_objects import SourceType


@dataclass
class ParseListingInput:
    url: str
    user_prompt: str | None = None


class ParseListingService:
    """Use case: parse a property listing URL and extract structured data."""

    def __init__(
        self,
        parser_factory: Callable[[SourceType], ContentParser],
        extractor: DataExtractor,
        mapper: PropertyDataMapper,
    ) -> None:
        self._parser_factory = parser_factory
        self._extractor = extractor
        self._mapper = mapper

    async def execute(self, inp: ParseListingInput) -> ParseResult:
        source_type = SourceType.detect_from_url(inp.url)
        parser = self._parser_factory(source_type)

        warnings: list[str] = []

        # Fetch content
        try:
            content = await parser.fetch_content(inp.url)
        except Exception as e:
            raise ValueError(f"Failed to fetch listing: {e}") from e
        if not content.strip():
            raise ValueError("Listing page returned empty content")

        # Extract data using LLM
        try:
            raw_data = await self._extractor.extract(content, source_type, inp.user_prompt)
        except ValueError as e:
            raise ValueError(f"Failed to extract listing data: {e}") from e
        except Exception as e:
            warnings.append(f"LLM extraction failed: {e}")
            raw_data = {}

        # Map to property entity
        property_data = self._mapper.map_to_property(raw_data, inp.url, source_type)
        confidence = self._mapper.calculate_confidence(property_data)

        return ParseResult(
            source_url=inp.url,
            source_type=source_type,
            raw_data=raw_data,
            property_data=property_data,
            confidence=confidence,
            warnings=warnings,
        )
