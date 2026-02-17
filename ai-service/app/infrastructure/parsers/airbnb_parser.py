from __future__ import annotations

import logging

from app.domain.value_objects import SourceType
from app.infrastructure.parsers.base import BaseParser

logger = logging.getLogger(__name__)


class AirbnbParser(BaseParser):
    """Parser for Airbnb property listings."""

    def get_source_type(self) -> SourceType:
        return SourceType.AIRBNB

    async def fetch_content(self, url: str) -> str:
        logger.info("Fetching Airbnb listing: %s", url)
        try:
            html = await self._fetch_html(url)
        except Exception:
            logger.exception("Failed to fetch Airbnb listing: %s", url)
            raise

        images = self._extract_images(html)
        text = self._clean_html(html)

        if images:
            text += "\n\n[IMAGES]\n" + "\n".join(images[:20])

        return text
