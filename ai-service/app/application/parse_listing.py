from __future__ import annotations

import re
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

    @staticmethod
    def _extract_coordinates_from_content(content: str) -> tuple[float, float] | None:
        """Extract coordinates from the parser's explicit [MAP_COORDINATES] block."""
        lat_match = re.search(
            r"\[MAP_COORDINATES\].*?latitude:\s*([-+]?\d+(?:\.\d+)?)",
            content,
            flags=re.IGNORECASE | re.DOTALL,
        )
        lon_match = re.search(
            r"\[MAP_COORDINATES\].*?longitude:\s*([-+]?\d+(?:\.\d+)?)",
            content,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if not lat_match or not lon_match:
            return None
        try:
            return float(lat_match.group(1)), float(lon_match.group(1))
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _extract_krisha_meta_from_content(
        content: str,
    ) -> tuple[str | None, str | None, int | None, str | None, str | None]:
        """Extract parser-provided Krisha meta block values."""
        complex_match = re.search(
            r"\[KRISHA_META\].*?complex_name:\s*(.+)",
            content,
            flags=re.IGNORECASE | re.DOTALL,
        )
        microdistrict_match = re.search(
            r"\[KRISHA_META\].*?microdistrict:\s*(.+)",
            content,
            flags=re.IGNORECASE | re.DOTALL,
        )
        floor_match = re.search(
            r"\[KRISHA_META\].*?floor:\s*(\d+)",
            content,
            flags=re.IGNORECASE | re.DOTALL,
        )
        street_match = re.search(
            r"\[KRISHA_META\].*?street:\s*(.+)",
            content,
            flags=re.IGNORECASE | re.DOTALL,
        )
        house_number_match = re.search(
            r"\[KRISHA_META\].*?house_number:\s*(.+)",
            content,
            flags=re.IGNORECASE | re.DOTALL,
        )

        complex_name: str | None = None
        if complex_match:
            # Keep only the first line of value to avoid bleeding into next sections.
            complex_name = complex_match.group(1).splitlines()[0].strip() or None

        microdistrict: str | None = None
        if microdistrict_match:
            microdistrict = microdistrict_match.group(1).splitlines()[0].strip() or None

        floor: int | None = None
        if floor_match:
            try:
                floor = int(floor_match.group(1))
            except ValueError:
                floor = None

        street: str | None = None
        if street_match:
            street = street_match.group(1).splitlines()[0].strip() or None

        house_number: str | None = None
        if house_number_match:
            house_number = house_number_match.group(1).splitlines()[0].strip() or None

        return complex_name, microdistrict, floor, street, house_number

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

        # Deterministic fallback: if parser extracted map coordinates, preserve them
        # even when the LLM omits latitude/longitude.
        coords = self._extract_coordinates_from_content(content)
        if coords is not None:
            lat, lon = coords
            if raw_data.get("latitude") is None and raw_data.get("lat") is None:
                raw_data["latitude"] = lat
            if (
                raw_data.get("longitude") is None
                and raw_data.get("lon") is None
                and raw_data.get("lng") is None
            ):
                raw_data["longitude"] = lon

        complex_name, microdistrict, floor, street, house_number = self._extract_krisha_meta_from_content(content)
        if complex_name and not raw_data.get("complex_name"):
            raw_data["complex_name"] = complex_name
        if microdistrict and not raw_data.get("microdistrict"):
            raw_data["microdistrict"] = microdistrict
        if floor is not None and raw_data.get("floor") is None:
            raw_data["floor"] = floor
        if street and not raw_data.get("street"):
            raw_data["street"] = street
        if house_number and not raw_data.get("house_number") and not raw_data.get("house_num"):
            raw_data["house_number"] = house_number

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
