"""Errors the booking domain raises on purpose."""


class BookingOverlapError(ValueError):
    """The stay shares a night with an active booking of the same property.

    A ValueError, so callers that already catch ValueError (the assistant, the
    guest bot) keep working; the HTTP layer answers it with 409.
    """

    def __init__(self, message: str = "Date range overlaps with existing booking") -> None:
        super().__init__(message)
