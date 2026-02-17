from __future__ import annotations

import json
import logging

from bs4 import BeautifulSoup

from app.domain.value_objects import SourceType
from app.infrastructure.parsers.base import BaseParser

logger = logging.getLogger(__name__)


class AirbnbParser(BaseParser):
    """Parser for Airbnb property listings."""

    def get_source_type(self) -> SourceType:
        return SourceType.AIRBNB

    def _extract_ld_json(self, html: str) -> dict:
        """Extract primary JSON-LD object from Airbnb page."""
        soup = BeautifulSoup(html, "lxml")
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            raw = script.string or script.get_text()
            if not raw:
                continue
            try:
                parsed = json.loads(raw)
            except Exception:
                continue

            candidates = parsed if isinstance(parsed, list) else [parsed]
            for candidate in candidates:
                if not isinstance(candidate, dict):
                    continue
                obj_type = str(candidate.get("@type", "")).lower()
                if obj_type in {"vacationrental", "lodgingbusiness", "hotel", "accommodation"}:
                    return candidate
        return {}

    async def fetch_content(self, url: str) -> str:
        logger.info("Fetching Airbnb listing: %s", url)
        try:
            html = await self._fetch_html(url)
        except Exception:
            logger.exception("Failed to fetch Airbnb listing: %s", url)
            raise

        images = self._extract_images(html)
        structured = self._extract_ld_json(html)
        text = self._clean_html(html)

        # Airbnb keeps most useful fields in JSON-LD script tags.
        if structured:
            text += "\n\n[STRUCTURED_DATA]\n" + json.dumps(structured, ensure_ascii=False)

            ld_images = structured.get("image")
            if isinstance(ld_images, list):
                for img in ld_images:
                    if isinstance(img, str) and img.startswith("http"):
                        images.append(img)

        # Keep image list short and unique.
        if images:
            dedup_images = list(dict.fromkeys(images))
            text += "\n\n[IMAGES]\n" + "\n".join(dedup_images[:30])

        return text
