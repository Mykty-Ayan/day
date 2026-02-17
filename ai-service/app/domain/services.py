from __future__ import annotations

import abc

from app.domain.entities import ExtractedProperty
from app.domain.value_objects import SourceType


class ContentParser(abc.ABC):
    """Domain interface for fetching and cleaning listing page content."""

    @abc.abstractmethod
    async def fetch_content(self, url: str) -> str: ...

    @abc.abstractmethod
    def get_source_type(self) -> SourceType: ...


class DataExtractor(abc.ABC):
    """Domain interface for extracting structured data from text content."""

    @abc.abstractmethod
    async def extract(self, content: str, source_type: SourceType, user_prompt: str | None = None) -> dict: ...


class PropertyDataMapper(abc.ABC):
    """Domain interface for mapping raw extracted data to Property entity."""

    @abc.abstractmethod
    def map_to_property(self, raw_data: dict, source_url: str, source_type: SourceType) -> ExtractedProperty: ...

    @abc.abstractmethod
    def calculate_confidence(self, property_data: ExtractedProperty) -> float: ...
