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
