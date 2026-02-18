from __future__ import annotations

import json
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
    def _coerce_int(value: object) -> int | None:
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, float) and value.is_integer():
            return int(value)
        if isinstance(value, str):
            match = re.search(r"\d+", value)
            if match:
                try:
                    return int(match.group(0))
                except ValueError:
                    return None
        return None

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

    @staticmethod
    def _extract_airbnb_enrichment_from_content(content: str) -> dict:
        """Extract parser-provided Airbnb enrichment JSON block values."""
        marker = "[AIRBNB_ENRICHMENT]"
        if marker not in content:
            return {}

        after_marker = content.split(marker, maxsplit=1)[1]
        for line in after_marker.splitlines():
            candidate = line.strip()
            if not candidate:
                continue
            if candidate.startswith("[") and candidate.endswith("]"):
                break
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed
        return {}

    @staticmethod
    def _apply_airbnb_enrichment(raw_data: dict, enrichment: dict) -> None:
        if not enrichment:
            return

        # Keep raw enrichment fields for parser upgrades.
        passthrough_keys = {
            "airbnb_listing_id",
            "airbnb_search_url",
            "source_room_url",
            "airbnb_badges",
            "airbnb_rating_label",
            "airbnb_price_breakdown_items",
            "airbnb_primary_price_label",
            "airbnb_policies_title",
            "airbnb_highlights",
            "airbnb_amenity_groups",
            "airbnb_pagination_cursor",
            "airbnb_stay_window",
            "airbnb_stay_window_available",
            "airbnb_place_id",
        }
        for key in passthrough_keys:
            if raw_data.get(key) is None and enrichment.get(key) is not None:
                raw_data[key] = enrichment[key]

        if not raw_data.get("name") and enrichment.get("name"):
            raw_data["name"] = enrichment["name"]
        if not raw_data.get("type") and enrichment.get("type"):
            raw_data["type"] = enrichment["type"]
        if raw_data.get("latitude") is None and raw_data.get("lat") is None and enrichment.get("latitude") is not None:
            raw_data["latitude"] = enrichment["latitude"]
        if (
            raw_data.get("longitude") is None
            and raw_data.get("lon") is None
            and raw_data.get("lng") is None
            and enrichment.get("longitude") is not None
        ):
            raw_data["longitude"] = enrichment["longitude"]
        if not raw_data.get("address_full") and enrichment.get("address_full"):
            raw_data["address_full"] = enrichment["address_full"]
        if not raw_data.get("description") and enrichment.get("description"):
            raw_data["description"] = enrichment["description"]

        if raw_data.get("rooms") is None and enrichment.get("rooms") is not None:
            rooms = ParseListingService._coerce_int(enrichment.get("rooms"))
            if rooms is not None:
                raw_data["rooms"] = rooms
        if raw_data.get("beds") is None and enrichment.get("beds") is not None:
            beds = ParseListingService._coerce_int(enrichment.get("beds"))
            if beds is not None:
                raw_data["beds"] = beds

        if not raw_data.get("check_in_instructions") and enrichment.get("check_in_instructions"):
            raw_data["check_in_instructions"] = enrichment["check_in_instructions"]
        if not raw_data.get("check_out_instructions") and enrichment.get("check_out_instructions"):
            raw_data["check_out_instructions"] = enrichment["check_out_instructions"]

        if not raw_data.get("amenities"):
            amenities = enrichment.get("amenities")
            if isinstance(amenities, list):
                raw_data["amenities"] = [str(a).strip() for a in amenities if str(a).strip()]

        if not raw_data.get("house_rules"):
            rules = enrichment.get("house_rules")
            if isinstance(rules, list):
                rule_lines = [str(r).strip() for r in rules if str(r).strip()]
                if rule_lines:
                    raw_data["house_rules"] = "\n".join(rule_lines)
            elif isinstance(rules, str) and rules.strip():
                raw_data["house_rules"] = rules.strip()

        if raw_data.get("base_price") is None and enrichment.get("base_price") is not None:
            raw_data["base_price"] = enrichment["base_price"]

        if not raw_data.get("photos"):
            photos = enrichment.get("photos")
            if isinstance(photos, list):
                parsed_photos = [str(p).strip() for p in photos if isinstance(p, str) and p.strip().startswith("http")]
                if parsed_photos:
                    raw_data["photos"] = parsed_photos

    async def execute(self, inp: ParseListingInput) -> ParseResult:
        normalized_url = SourceType.normalize_url(inp.url)
        source_type = SourceType.detect_from_url(normalized_url)
        parser = self._parser_factory(source_type)

        warnings: list[str] = []

        # Fetch content
        try:
            content = await parser.fetch_content(normalized_url)
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

        # Deterministic fallback: enrich from parser-provided Airbnb metadata.
        self._apply_airbnb_enrichment(raw_data, self._extract_airbnb_enrichment_from_content(content))

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
        property_data = self._mapper.map_to_property(raw_data, normalized_url, source_type)
        confidence = self._mapper.calculate_confidence(property_data)

        return ParseResult(
            source_url=normalized_url,
            source_type=source_type,
            raw_data=raw_data,
            property_data=property_data,
            confidence=confidence,
            warnings=warnings,
        )
