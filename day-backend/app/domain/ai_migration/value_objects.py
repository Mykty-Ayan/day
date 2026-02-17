import enum
import re
from urllib.parse import urlsplit, urlunsplit


class ImportJobStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ImportSource(str, enum.Enum):
    BOOKING = "booking"
    AIRBNB = "airbnb"
    KRISHA = "krisha"
    OTHER = "other"

    @staticmethod
    def normalize_url(url: str) -> str:
        """Normalize known source URL variants to a canonical form."""
        candidate = (url or "").strip()
        if not candidate:
            return candidate

        if candidate.lower().startswith(("krisha.kz/", "www.krisha.kz/")):
            candidate = f"https://{candidate}"

        parsed = urlsplit(candidate)
        host = parsed.netloc.lower()
        if host.startswith("www."):
            host = host[4:]

        if host != "krisha.kz":
            return candidate

        match = re.match(r"^/(?:a/)?show/(\d+)/?$", parsed.path)
        if not match:
            return candidate

        listing_id = match.group(1)
        return urlunsplit(("https", "krisha.kz", f"/a/show/{listing_id}", parsed.query, parsed.fragment))

    @staticmethod
    def detect_from_url(url: str) -> "ImportSource":
        url_lower = ImportSource.normalize_url(url).lower()
        if "booking.com" in url_lower:
            return ImportSource.BOOKING
        if "airbnb" in url_lower:
            return ImportSource.AIRBNB
        if "krisha.kz" in url_lower:
            return ImportSource.KRISHA
        return ImportSource.OTHER
