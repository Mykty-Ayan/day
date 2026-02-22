from __future__ import annotations

import logging

from app.config import settings
from app.domain.services import ContentParser
from app.domain.value_objects import SourceType

logger = logging.getLogger(__name__)


class TextParser(ContentParser):
    """Parser for raw text input — no URL fetching required."""

    def __init__(self, text: str) -> None:
        self._text = text

    def get_source_type(self) -> SourceType:
        return SourceType.TEXT

    async def fetch_content(self, url: str) -> str:
        """Return the raw text directly (url argument is ignored)."""
        logger.info("Using raw text input (%d chars)", len(self._text))
        content = self._text.strip()
        if len(content) > settings.MAX_CONTENT_LENGTH:
            content = content[: settings.MAX_CONTENT_LENGTH]
        return content
