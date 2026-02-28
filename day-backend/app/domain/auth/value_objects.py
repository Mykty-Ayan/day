import enum


class UserRole(str, enum.Enum):
    OWNER = "owner"
    MANAGER = "manager"
    CLEANER = "cleaner"
