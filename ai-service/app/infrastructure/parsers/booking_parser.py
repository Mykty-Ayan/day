from __future__ import annotations

import logging

from app.domain.value_objects import SourceType
from app.infrastructure.parsers.base import BaseParser

logger = logging.getLogger(__name__)


class BookingParser(BaseParser):
    """Parser for Booking.com property listings."""

    def get_source_type(self) -> SourceType:
        return SourceType.BOOKING

    async def fetch_content(self, url: str) -> str:
        logger.info("Fetching Booking.com listing: %s", url)
        try:
            html = await self._fetch_html(url)
        except Exception:
            logger.exception("Failed to fetch Booking.com listing: %s", url)
            raise

        # Extract images before cleaning
        images = self._extract_images(html)

        # Clean HTML to text
        text = self._clean_html(html)

        # Append image URLs for LLM context
        if images:
            text += "\n\n[IMAGES]\n" + "\n".join(images[:20])

        return text
