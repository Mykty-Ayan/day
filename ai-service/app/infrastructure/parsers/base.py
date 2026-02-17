from __future__ import annotations

import logging

import httpx
from bs4 import BeautifulSoup

from app.config import settings
from app.domain.services import ContentParser

logger = logging.getLogger(__name__)

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# Tags that are typically noise for content extraction
NOISE_TAGS = {"script", "style", "nav", "footer", "header", "noscript", "svg", "iframe", "form"}


class BaseParser(ContentParser):
    """Base parser providing common HTTP fetching and HTML cleaning logic."""

    async def _fetch_html(self, url: str) -> str:
        """Fetch raw HTML from URL using httpx with browser headers."""
        timeout = httpx.Timeout(settings.REQUEST_TIMEOUT)
        async with httpx.AsyncClient(headers=BROWSER_HEADERS, timeout=timeout, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.text

    def _clean_html(self, html: str) -> str:
        """Remove noise tags and extract meaningful text from HTML."""
        soup = BeautifulSoup(html, "lxml")

        # Remove noise elements
        for tag in soup.find_all(NOISE_TAGS):
            tag.decompose()

        # Extract text with reasonable whitespace handling
        text = soup.get_text(separator="\n", strip=True)

        # Collapse multiple blank lines
        lines = [line.strip() for line in text.splitlines()]
        lines = [line for line in lines if line]
        cleaned = "\n".join(lines)

        # Truncate to max content length
        if len(cleaned) > settings.MAX_CONTENT_LENGTH:
            cleaned = cleaned[: settings.MAX_CONTENT_LENGTH]

        return cleaned

    def _extract_images(self, html: str) -> list[str]:
        """Extract image URLs from HTML."""
        soup = BeautifulSoup(html, "lxml")
        images: list[str] = []
        for img in soup.find_all("img"):
            src = img.get("src") or img.get("data-src") or img.get("data-lazy-src")
            if src and isinstance(src, str) and src.startswith("http"):
                images.append(src)
        return images
