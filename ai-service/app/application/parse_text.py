from __future__ import annotations

from dataclasses import dataclass

from app.domain.entities import ParseResult
from app.domain.services import DataExtractor, PropertyDataMapper
from app.domain.value_objects import SourceType
from app.infrastructure.parsers.text_parser import TextParser


@dataclass
class ParseTextInput:
    text: str
    user_prompt: str | None = None


class ParseTextService:
    """Use case: parse raw text and extract structured property data."""

    def __init__(
        self,
        extractor: DataExtractor,
        mapper: PropertyDataMapper,
    ) -> None:
        self._extractor = extractor
        self._mapper = mapper

    async def execute(self, inp: ParseTextInput) -> ParseResult:
        parser = TextParser(inp.text)
        source_type = SourceType.TEXT

        warnings: list[str] = []

        # Fetch content (returns raw text directly)
        try:
            content = await parser.fetch_content("")
        except Exception as e:
            raise ValueError(f"Failed to process text: {e}") from e
        if not content.strip():
            raise ValueError("Provided text is empty")

        # Extract data using LLM
        try:
            raw_data = await self._extractor.extract(content, source_type, inp.user_prompt)
        except ValueError as e:
            raise ValueError(f"Failed to extract property data: {e}") from e
        except Exception as e:
            warnings.append(f"LLM extraction failed: {e}")
            raw_data = {}

        # Map to property entity
        property_data = self._mapper.map_to_property(raw_data, "", source_type)
        confidence = self._mapper.calculate_confidence(property_data)

        return ParseResult(
            source_url="",
            source_type=source_type,
            raw_data=raw_data,
            property_data=property_data,
            confidence=confidence,
            warnings=warnings,
        )
