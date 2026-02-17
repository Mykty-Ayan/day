from __future__ import annotations

import logging
import re

from bs4 import BeautifulSoup

from app.domain.value_objects import SourceType
from app.infrastructure.parsers.base import BaseParser

logger = logging.getLogger(__name__)


class KrishaParser(BaseParser):
    """Parser for Krisha.kz property listings."""

    _MAP_COORDS_PATTERN = re.compile(
        r'"map"\s*:\s*\{[^{}]*?"lat"\s*:\s*([-+]?\d+(?:\.\d+)?)'
        r'[^{}]*?"lon"\s*:\s*([-+]?\d+(?:\.\d+)?)',
        re.IGNORECASE | re.DOTALL,
    )
    _MAP_COORDS_REVERSED_PATTERN = re.compile(
        r'"map"\s*:\s*\{[^{}]*?"lon"\s*:\s*([-+]?\d+(?:\.\d+)?)'
        r'[^{}]*?"lat"\s*:\s*([-+]?\d+(?:\.\d+)?)',
        re.IGNORECASE | re.DOTALL,
    )
    _LAT_LNG_PATTERN = re.compile(
        r'"latLng"\s*:\s*"([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)"',
        re.IGNORECASE,
    )
    _MICRODISTRICT_PATTERN = re.compile(
        r'"microdistrict"\s*:\s*"([^"]+)"',
        re.IGNORECASE,
    )
    _STREET_PATTERN = re.compile(
        r'"street"\s*:\s*"([^"]+)"',
        re.IGNORECASE,
    )
    _HOUSE_NUM_PATTERN = re.compile(
        r'"house_num"\s*:\s*"([^"]+)"',
        re.IGNORECASE,
    )
    _COMPLEX_IN_DESCRIPTION_PATTERN = re.compile(
        r"жил\.?\s*комплекс\s+([^,.;\"\\<\n]+)",
        re.IGNORECASE,
    )

    def get_source_type(self) -> SourceType:
        return SourceType.KRISHA

    @classmethod
    def _extract_coordinates(cls, html: str) -> tuple[float, float] | None:
        """Extract coordinates from Krisha inline JSON/script blocks."""
        map_match = cls._MAP_COORDS_PATTERN.search(html)
        if map_match:
            try:
                return float(map_match.group(1)), float(map_match.group(2))
            except (TypeError, ValueError):
                pass

        map_match_reversed = cls._MAP_COORDS_REVERSED_PATTERN.search(html)
        if map_match_reversed:
            try:
                return float(map_match_reversed.group(2)), float(map_match_reversed.group(1))
            except (TypeError, ValueError):
                pass

        # Fallback for pages where only digitalData.latLng is present.
        lat_lng_match = cls._LAT_LNG_PATTERN.search(html)
        if lat_lng_match:
            try:
                return float(lat_lng_match.group(1)), float(lat_lng_match.group(2))
            except (TypeError, ValueError):
                pass

        return None

    @staticmethod
    def _normalize_meta_value(raw: str | None) -> str | None:
        """Normalize Krisha inline JSON field values for human-readable meta."""
        if not raw:
            return None
        normalized = re.sub(r"\s+", " ", raw.replace("_", " ")).strip(" ,")
        return normalized or None

    @staticmethod
    def _extract_complex_name(html: str) -> str | None:
        """Extract residential complex name from Krisha detail blocks."""
        soup = BeautifulSoup(html, "lxml")
        node = soup.select_one('.offer__info-item[data-name="map.complex"] .offer__advert-short-info')
        if node:
            text = node.get_text(" ", strip=True)
            normalized = KrishaParser._normalize_meta_value(text)
            if normalized:
                return normalized

        # Fallback for pages where complex name appears only inside JSON description.
        match = KrishaParser._COMPLEX_IN_DESCRIPTION_PATTERN.search(html)
        if not match:
            return None
        return KrishaParser._normalize_meta_value(match.group(1))

    @staticmethod
    def _extract_floor(html: str) -> int | None:
        """Extract current floor number from Krisha detail blocks (e.g. '12 из 12')."""
        soup = BeautifulSoup(html, "lxml")
        node = soup.select_one('.offer__info-item[data-name="flat.floor"] .offer__advert-short-info')
        if not node:
            return None
        text = node.get_text(" ", strip=True)
        match = re.search(r"(\d+)", text)
        if not match:
            return None
        try:
            return int(match.group(1))
        except ValueError:
            return None

    @classmethod
    def _extract_microdistrict(cls, html: str) -> str | None:
        """Extract microdistrict from Krisha inline JSON (e.g. mkr_Akkent)."""
        match = cls._MICRODISTRICT_PATTERN.search(html)
        if not match:
            return None

        raw = match.group(1).strip()
        normalized = cls._normalize_meta_value(raw)
        if not normalized:
            return None

        if normalized.lower().startswith("mkr "):
            return normalized

        return f"mkr {normalized}"

    @classmethod
    def _extract_street(cls, html: str) -> str | None:
        """Extract street name from Krisha inline JSON address."""
        match = cls._STREET_PATTERN.search(html)
        if not match:
            return None
        return cls._normalize_meta_value(match.group(1))

    @classmethod
    def _extract_house_number(cls, html: str) -> str | None:
        """Extract house number from Krisha inline JSON address."""
        match = cls._HOUSE_NUM_PATTERN.search(html)
        if not match:
            return None
        return cls._normalize_meta_value(match.group(1))

    async def fetch_content(self, url: str) -> str:
        logger.info("Fetching Krisha.kz listing: %s", url)
        try:
            html = await self._fetch_html(url)
        except Exception:
            logger.exception("Failed to fetch Krisha.kz listing: %s", url)
            raise

        images = self._extract_images(html)
        text = self._clean_html(html)
        coords = self._extract_coordinates(html)
        complex_name = self._extract_complex_name(html)
        floor = self._extract_floor(html)
        microdistrict = self._extract_microdistrict(html)
        street = self._extract_street(html)
        house_number = self._extract_house_number(html)

        if complex_name or floor is not None or microdistrict or street or house_number:
            text += "\n\n[KRISHA_META]"
            if complex_name:
                text += f"\ncomplex_name: {complex_name}"
            if microdistrict:
                text += f"\nmicrodistrict: {microdistrict}"
            if street:
                text += f"\nstreet: {street}"
            if house_number:
                text += f"\nhouse_number: {house_number}"
            if floor is not None:
                text += f"\nfloor: {floor}"

        if coords:
            lat, lon = coords
            text += f"\n\n[MAP_COORDINATES]\nlatitude: {lat}\nlongitude: {lon}"

        if images:
            text += "\n\n[IMAGES]\n" + "\n".join(images[:20])

        return text
