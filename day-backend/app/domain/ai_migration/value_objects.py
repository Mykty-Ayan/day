import enum


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
    def detect_from_url(url: str) -> "ImportSource":
        url_lower = url.lower()
        if "booking.com" in url_lower:
            return ImportSource.BOOKING
        if "airbnb" in url_lower:
            return ImportSource.AIRBNB
        if "krisha.kz" in url_lower:
            return ImportSource.KRISHA
        return ImportSource.OTHER
