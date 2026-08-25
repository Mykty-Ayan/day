import enum

from app.domain.booking.value_objects import BookingSource


class ListingSyncState(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    ERROR = "error"


class ChannexBookingStatus(str, enum.Enum):
    NEW = "new"
    MODIFIED = "modified"
    CANCELLED = "cancelled"


# Channex reports the originating OTA as a display name; anything unknown is
# still a valid external booking, it just lands in the OTHER bucket.
_OTA_TO_SOURCE: dict[str, BookingSource] = {
    "booking.com": BookingSource.BOOKING,
    "airbnb": BookingSource.AIRBNB,
}


def booking_source_for_ota(ota_name: str) -> BookingSource:
    return _OTA_TO_SOURCE.get(ota_name.strip().lower(), BookingSource.OTHER)
