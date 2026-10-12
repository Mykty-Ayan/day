"""Errors the booking domain raises on purpose."""


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
