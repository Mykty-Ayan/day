from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.value_objects import SourceType


@dataclass
class ExtractedProperty:
    """Domain entity representing property data extracted from a listing."""

    name: str | None = None
    internal_name: str | None = None
    type: str | None = None  # apartment | house | room
    description: str | None = None
    source_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    address_full: str | None = None
    rooms: int | None = None
    beds: int | None = None
    area_total: float | None = None
    area_living: float | None = None
    floor: int | None = None
    check_in_instructions: str | None = None
    check_out_instructions: str | None = None
    house_rules: str | None = None
    amenities: list[str] = field(default_factory=list)
    base_price: float | None = None
    photos: list[str] = field(default_factory=list)


@dataclass
class ParseResult:
    """Domain entity representing the complete result of parsing a listing."""

    source_url: str = ""
    source_type: SourceType = SourceType.OTHER
    raw_data: dict = field(default_factory=dict)
    property_data: ExtractedProperty = field(default_factory=ExtractedProperty)
    confidence: float = 0.0
    warnings: list[str] = field(default_factory=list)
