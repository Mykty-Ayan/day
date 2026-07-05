import enum


class BookingStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CHECKED_IN = "checked_in"
    CHECKED_OUT = "checked_out"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

    def can_transition_to(self, target: "BookingStatus") -> bool:
        return target in _BOOKING_TRANSITIONS.get(self, set())


_BOOKING_TRANSITIONS: dict[BookingStatus, set[BookingStatus]] = {
    BookingStatus.PENDING: {BookingStatus.CONFIRMED, BookingStatus.CANCELLED},
    BookingStatus.CONFIRMED: {BookingStatus.CHECKED_IN, BookingStatus.CANCELLED},
    BookingStatus.CHECKED_IN: {BookingStatus.CHECKED_OUT},
    BookingStatus.CHECKED_OUT: {BookingStatus.COMPLETED},
}


class RentalMode(str, enum.Enum):
    DAILY = "daily"
    HOURLY = "hourly"
    BOTH = "both"


class BookingSource(str, enum.Enum):
    DIRECT = "direct"
    BOOKING = "booking"
    AIRBNB = "airbnb"
    OTHER = "other"


class PaymentType(str, enum.Enum):
    PAYMENT = "payment"
    REFUND = "refund"


class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    CARD = "card"
    TRANSFER = "transfer"


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class DepositStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    RETURNED = "returned"
    HELD = "held"
    PARTIALLY_HELD = "partially_held"

    def can_transition_to(self, target: "DepositStatus") -> bool:
        return target in _DEPOSIT_TRANSITIONS.get(self, set())


_DEPOSIT_TRANSITIONS: dict[DepositStatus, set[DepositStatus]] = {
    DepositStatus.PENDING: {DepositStatus.PAID},
    DepositStatus.PAID: {DepositStatus.RETURNED, DepositStatus.HELD, DepositStatus.PARTIALLY_HELD},
}


class ContractStatus(str, enum.Enum):
    DRAFT = "draft"
    GENERATED = "generated"
    SENT = "sent"
    SIGNED = "signed"


class GroupStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class BookingAuditAction(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    STATUS_CHANGE = "status_change"
    MOVE = "move"
