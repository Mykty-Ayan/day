import enum


class PropertyType(str, enum.Enum):
    APARTMENT = "apartment"
    HOUSE = "house"
    ROOM = "room"


class PropertyStatus(str, enum.Enum):
    NEW = "new"
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"

    def can_transition_to(self, target: "PropertyStatus") -> bool:
        return target in _ALLOWED_TRANSITIONS.get(self, set())


_ALLOWED_TRANSITIONS: dict[PropertyStatus, set[PropertyStatus]] = {
    PropertyStatus.NEW: {PropertyStatus.ACTIVE},
    PropertyStatus.ACTIVE: {PropertyStatus.PAUSED, PropertyStatus.ARCHIVED},
    PropertyStatus.PAUSED: {PropertyStatus.ACTIVE, PropertyStatus.ARCHIVED},
    PropertyStatus.ARCHIVED: {PropertyStatus.ACTIVE},
}


class AmenityCategory(str, enum.Enum):
    BATHROOM = "bathroom"
    KITCHEN = "kitchen"
    ENTERTAINMENT = "entertainment"
    SAFETY = "safety"
    COMFORT = "comfort"
    OUTDOOR = "outdoor"
    ACCESSIBILITY = "accessibility"
    OTHER = "other"


class AuditAction(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    STATUS_CHANGE = "status_change"
    CLONE = "clone"


class CheckInMethod(str, enum.Enum):
    """How the guest gets in — the choices Airbnb and Booking.com offer."""

    LOCKBOX = "lockbox"
    KEYPAD = "keypad"
    SMART_LOCK = "smart_lock"
    BUILDING_STAFF = "building_staff"
    HOST_GREETS = "host_greets"
    OTHER = "other"


class FactAudience(str, enum.Enum):
    """Who may hear a fact about an apartment."""

    PUBLIC = "public"  # anyone who asks, before booking
    GUEST = "guest"  # only a guest with a confirmed stay: codes, passwords


class FactSource(str, enum.Enum):
    """The kind of credential that wrote a fact."""

    USER = "user"  # a person logged in to Day
    API_KEY = "api_key"  # an integration, e.g. the CRM after the owner approved a learned fact
