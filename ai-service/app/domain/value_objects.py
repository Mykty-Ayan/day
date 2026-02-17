from __future__ import annotations

import enum


class SourceType(str, enum.Enum):
    BOOKING = "booking"
    AIRBNB = "airbnb"
    KRISHA = "krisha"
    OTHER = "other"

    @staticmethod
    def detect_from_url(url: str) -> SourceType:
        url_lower = url.lower()
        if "booking.com" in url_lower:
            return SourceType.BOOKING
        if "airbnb" in url_lower:
            return SourceType.AIRBNB
        if "krisha.kz" in url_lower:
            return SourceType.KRISHA
        return SourceType.OTHER
