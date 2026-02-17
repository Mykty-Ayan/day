from __future__ import annotations

from pydantic import BaseModel, Field


class ParseRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2048)
    user_prompt: str | None = None


class ExtractedPropertyResponse(BaseModel):
    name: str | None = None
    internal_name: str | None = None
    type: str | None = None
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
    amenities: list[str] = []
    base_price: float | None = None
    photos: list[str] = []


class ParseResponse(BaseModel):
    source_url: str
    source_type: str
    raw_data: dict
    property_data: ExtractedPropertyResponse
    confidence: float
    warnings: list[str] = []
