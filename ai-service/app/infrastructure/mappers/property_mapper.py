from __future__ import annotations

import logging
import re
import unicodedata

from app.domain.entities import ExtractedProperty
from app.domain.services import PropertyDataMapper
from app.domain.value_objects import SourceType

logger = logging.getLogger(__name__)

# Fields used for confidence scoring, with their weights
CONFIDENCE_FIELDS: dict[str, float] = {
    "name": 0.20,
    "type": 0.05,
    "description": 0.10,
    "address_full": 0.15,
    "rooms": 0.10,
    "beds": 0.05,
    "base_price": 0.15,
    "amenities": 0.10,
    "photos": 0.10,
}

VALID_PROPERTY_TYPES = {"apartment", "house", "room"}


def _slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    # Normalize unicode to ASCII
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    # Replace non-alphanumeric with hyphens
    text = re.sub(r"[^a-z0-9]+", "-", text)
    # Remove leading/trailing hyphens
    text = text.strip("-")
    return text or "unnamed-property"


def _strip_html(text: str | None) -> str | None:
    """Remove HTML tags from a string."""
    if not text:
        return None
    # Simple HTML tag removal
    cleaned = re.sub(r"<[^>]+>", "", str(text))
    # Collapse whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned if cleaned else None


def _safe_int(value: object) -> int | None:
    """Safely convert a value to int, returning None on failure."""
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _safe_float(value: object) -> float | None:
    """Safely convert a value to float, returning None on failure."""
    if value is None:
        return None
    try:
        result = float(value)
        # Reject NaN and Inf
        if result != result or result == float("inf") or result == float("-inf"):
            return None
        return result
    except (ValueError, TypeError):
        return None


def _normalize_property_type(raw_type: str | None) -> str | None:
    """Normalize property type to one of: apartment, house, room."""
    if not raw_type:
        return None
    normalized = str(raw_type).lower().strip()

    # Direct match
    if normalized in VALID_PROPERTY_TYPES:
        return normalized

    # Common aliases
    if normalized in {"flat", "studio", "condo", "condominium", "loft"}:
        return "apartment"
    if normalized in {"villa", "cottage", "townhouse", "bungalow", "cabin", "chalet"}:
        return "house"
    if normalized in {"suite", "private room", "shared room", "bedroom"}:
        return "room"

    return None


class DefaultPropertyMapper(PropertyDataMapper):
    """Maps raw LLM extraction output to ExtractedProperty domain entity."""

    def map_to_property(self, raw_data: dict, source_url: str, source_type: SourceType) -> ExtractedProperty:
        if not raw_data:
            return ExtractedProperty(source_url=source_url)

        name = _strip_html(raw_data.get("name"))
        internal_name = _slugify(name) if name else None
        property_type = _normalize_property_type(raw_data.get("type"))

        # Extract amenities as list of strings
        raw_amenities = raw_data.get("amenities")
        amenities: list[str] = []
        if isinstance(raw_amenities, list):
            amenities = [str(a).strip() for a in raw_amenities if a and str(a).strip()]

        # Extract photos as list of strings
        raw_photos = raw_data.get("photos")
        photos: list[str] = []
        if isinstance(raw_photos, list):
            photos = [str(p).strip() for p in raw_photos if p and str(p).strip().startswith("http")]

        return ExtractedProperty(
            name=name,
            internal_name=internal_name,
            type=property_type,
            description=_strip_html(raw_data.get("description")),
            source_url=source_url,
            latitude=_safe_float(raw_data.get("latitude")),
            longitude=_safe_float(raw_data.get("longitude")),
            address_full=_strip_html(raw_data.get("address_full")),
            rooms=_safe_int(raw_data.get("rooms")),
            beds=_safe_int(raw_data.get("beds")),
            area_total=_safe_float(raw_data.get("area_total")),
            area_living=_safe_float(raw_data.get("area_living")),
            floor=_safe_int(raw_data.get("floor")),
            check_in_instructions=_strip_html(raw_data.get("check_in_instructions")),
            check_out_instructions=_strip_html(raw_data.get("check_out_instructions")),
            house_rules=_strip_html(raw_data.get("house_rules")),
            amenities=amenities,
            base_price=_safe_float(raw_data.get("base_price")),
            photos=photos,
        )

    def calculate_confidence(self, property_data: ExtractedProperty) -> float:
        """Calculate a 0.0-1.0 confidence score based on how many fields are populated."""
        score = 0.0

        for field_name, weight in CONFIDENCE_FIELDS.items():
            value = getattr(property_data, field_name, None)
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue
            if isinstance(value, list) and len(value) == 0:
                continue
            score += weight

        # Clamp to [0, 1]
        return round(min(max(score, 0.0), 1.0), 2)
