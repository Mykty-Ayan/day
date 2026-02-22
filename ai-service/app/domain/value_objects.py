from __future__ import annotations

import enum
import re
from urllib.parse import urlsplit, urlunsplit


class SourceType(str, enum.Enum):
    BOOKING = "booking"
    AIRBNB = "airbnb"
    KRISHA = "krisha"
    TEXT = "text"
    OTHER = "other"

    @staticmethod
    def normalize_url(url: str) -> str:
        """Normalize known source URL variants to a canonical form."""
        candidate = (url or "").strip()
        if not candidate:
            return candidate

        # Accept scheme-less Krisha URLs like "krisha.kz/show/12345".
        if candidate.lower().startswith(("krisha.kz/", "www.krisha.kz/", "airbnb.", "www.airbnb.")):
            candidate = f"https://{candidate}"

        parsed = urlsplit(candidate)
        host = parsed.netloc.lower()
        if host.startswith("www."):
            host_wo_www = host[4:]
        else:
            host_wo_www = host

        if host_wo_www == "krisha.kz":
            match = re.match(r"^/(?:a/)?show/(\d+)/?$", parsed.path)
            if not match:
                return candidate

            listing_id = match.group(1)
            return urlunsplit(("https", "krisha.kz", f"/a/show/{listing_id}", parsed.query, parsed.fragment))

        # Accept Airbnb host console links and normalize to room URLs.
        if host_wo_www.startswith("airbnb."):
            room_match = re.match(r"^/rooms/(\d+)(?:/.*)?$", parsed.path)
            editor_match = re.match(r"^/hosting/listings/editor/(\d+)(?:/.*)?$", parsed.path)
            match = room_match or editor_match
            if not match:
                return candidate

            listing_id = match.group(1)
            canonical_host = host or host_wo_www
            return urlunsplit(("https", canonical_host, f"/rooms/{listing_id}", parsed.query, parsed.fragment))

        return candidate

    @staticmethod
    def detect_from_url(url: str) -> SourceType:
        url_lower = SourceType.normalize_url(url).lower()
        if "booking.com" in url_lower:
            return SourceType.BOOKING
        if "airbnb" in url_lower:
            return SourceType.AIRBNB
        if "krisha.kz" in url_lower:
            return SourceType.KRISHA
        return SourceType.OTHER
