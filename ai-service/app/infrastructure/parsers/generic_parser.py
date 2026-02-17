from __future__ import annotations

import logging

from app.domain.value_objects import SourceType
from app.infrastructure.parsers.base import BaseParser

logger = logging.getLogger(__name__)


class GenericParser(BaseParser):
    """Generic parser for unknown property listing sources."""

    def get_source_type(self) -> SourceType:
        return SourceType.OTHER

    async def fetch_content(self, url: str) -> str:
        logger.info("Fetching generic listing: %s", url)
        try:
            html = await self._fetch_html(url)
        except Exception:
            logger.exception("Failed to fetch listing: %s", url)
            raise

        images = self._extract_images(html)
        text = self._clean_html(html)

        if images:
            text += "\n\n[IMAGES]\n" + "\n".join(images[:20])

        return text
