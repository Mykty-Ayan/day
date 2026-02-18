from __future__ import annotations

import logging

from app.domain.value_objects import SourceType
from app.infrastructure.parsers.base import BaseParser

logger = logging.getLogger(__name__)

CHALLENGE_MARKERS = (
    "__challenge_",
    "challenge-container",
    "awswafcookiedomainlist",
    "challenge.js",
)


class BookingParser(BaseParser):
    """Parser for Booking.com property listings."""

    def get_source_type(self) -> SourceType:
        return SourceType.BOOKING

    def _is_challenge_page(self, html: str) -> bool:
        html_lower = html.lower()
        return any(marker in html_lower for marker in CHALLENGE_MARKERS)

    async def fetch_content(self, url: str) -> str:
        logger.info("Fetching Booking.com listing: %s", url)
        try:
            html = await self._fetch_html(url)
        except Exception:
            logger.exception("Failed to fetch Booking.com listing: %s", url)
            raise

        if self._is_challenge_page(html):
            raise ValueError(
                "Booking.com returned an anti-bot challenge page; parsing blocked."
            )

        # Extract images before cleaning
        images = self._extract_images(html)

        # Clean HTML to text
        text = self._clean_html(html)

        if not text.strip():
            raise ValueError("Booking.com page returned empty content; parsing blocked.")

        # Append image URLs for LLM context
        if images:
            text += "\n\n[IMAGES]\n" + "\n".join(images[:20])

        return text
