"""Errors the booking domain raises on purpose."""

from app.domain.booking.stay_rules import RuleBreach


class BookingOverlapError(ValueError):
    """The stay shares a night with an active booking of the same property.

    A ValueError, so callers that already catch ValueError (the assistant, the
    guest bot) keep working; the HTTP layer answers it with 409.
    """

    def __init__(self, message: str = "Date range overlaps with existing booking") -> None:
        super().__init__(message)


class IdempotencyKeyReusedError(ValueError):
    """An Idempotency-Key came back with a request different from its first one."""

    def __init__(self) -> None:
        super().__init__("Idempotency-Key was already used with a different request")


class IdempotencyKeyTakenError(Exception):
    """Another request with the same Idempotency-Key committed first."""


class DepositAlreadyOpenError(ValueError):
    """A deposit was asked for only if none is open, and one is (not returned yet)."""

    def __init__(self) -> None:
        super().__init__("Booking already has an open deposit")


class IdempotencyKeyVoidedError(ValueError):
    """The client gave up on an Idempotency-Key it got no answer for; a late request with it makes nothing."""

    def __init__(self) -> None:
        super().__init__("Idempotency-Key was voided")


class StayRulesError(ValueError):
    """The booking breaks the apartment's stay rules (nights, cleaning buffer, lead time).

    A ValueError, so the assistant and the guest bot keep catching it; the HTTP
    layer answers 422 with the breaches, and the operator may send the same
    request again with override_rules.
    """

    def __init__(self, breaches: list[RuleBreach]) -> None:
        self.breaches = breaches
        broken = ", ".join(f"{b.rule} {b.limit} (booking: {b.actual})" for b in breaches)
        super().__init__(f"Booking breaks the apartment's stay rules: {broken}")


class PropertyBlockedError(ValueError):
    """The stay falls on nights the flat is closed (a block). The HTTP layer answers 409."""

    def __init__(self) -> None:
        super().__init__("Dates are blocked")


class BlockOverlapsBookingError(ValueError):
    """A block would close nights a booking already holds. The HTTP layer answers 409."""

    def __init__(self) -> None:
        super().__init__("Dates have bookings")
