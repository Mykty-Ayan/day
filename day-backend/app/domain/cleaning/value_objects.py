import enum


class CleaningType(str, enum.Enum):
    POST_CHECKOUT = "post_checkout"
    MID_STAY = "mid_stay"
    ON_DEMAND = "on_demand"


class CleaningStatus(str, enum.Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    VERIFIED = "verified"

    def can_transition_to(self, target: "CleaningStatus") -> bool:
        return target in _CLEANING_TRANSITIONS.get(self, set())


_CLEANING_TRANSITIONS: dict[CleaningStatus, set[CleaningStatus]] = {
    CleaningStatus.PENDING: {CleaningStatus.ASSIGNED},
    CleaningStatus.ASSIGNED: {CleaningStatus.IN_PROGRESS},
    CleaningStatus.IN_PROGRESS: {CleaningStatus.DONE},
    CleaningStatus.DONE: {CleaningStatus.VERIFIED},
}


class ReportStatus(str, enum.Enum):
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"


class RoomType(str, enum.Enum):
    BATHROOM = "bathroom"
    KITCHEN = "kitchen"
    BEDROOM = "bedroom"
    OTHER = "other"
