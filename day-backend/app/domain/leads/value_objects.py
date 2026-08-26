"""What a message in a colleagues' group turns out to be.

Subletters keep WhatsApp groups where they hand each other the guests they
cannot house themselves, for a cut. The same groups carry cleaning jobs, a
shared blacklist of guests, and ordinary chatter. Reading them by hand does not
scale, and the messages are written the way people write — "Абая Гагарина 1*2
ком на 4*5 суток. Бюджет до 20 к. Заезд завтра" — so the shape below is what a
model is asked to produce, not what a regular expression could.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass
from datetime import date
from decimal import Decimal


class MessageKind(str, enum.Enum):
    """Why this message matters, or that it does not."""

    #: Someone needs a flat for their guest and will pay a commission.
    REQUEST = "request"
    #: Someone offers a free flat to colleagues.
    OFFER = "offer"
    #: A guest's phone number with a warning attached.
    BLACKLIST = "blacklist"
    #: "Достаточно, больше не отправляйте" — an earlier request is closed.
    CLOSING = "closing"
    #: A cleaning job: address, rooms, time, price.
    CLEANING = "cleaning"
    #: Everything else — greetings, complaints, adverts, neighbours.
    NOISE = "noise"


@dataclass(frozen=True)
class DateRange:
    """When the guest wants the flat.

    `check_out` is often not stated: people write "на 2 суток" and leave the
    arithmetic to the reader. Nights survive that, a check-out date does not.
    """

    check_in: date | None = None
    nights: int | None = None

    @property
    def check_out(self) -> date | None:
        from datetime import timedelta

        if self.check_in is None or self.nights is None:
            return None
        return self.check_in + timedelta(days=self.nights)


@dataclass(frozen=True)
class RoomCount:
    """Requests come as ranges: "3-4 либо 2 двухкомнатные"."""

    minimum: int | None = None
    maximum: int | None = None

    def matches(self, rooms: int) -> bool:
        if self.minimum is not None and rooms < self.minimum:
            return False
        if self.maximum is not None and rooms > self.maximum:
            return False
        return True


@dataclass(frozen=True)
class ParsedMessage:
    """One group message, read."""

    kind: MessageKind
    district: str = ""
    guests: int | None = None
    rooms: RoomCount = RoomCount()
    dates: DateRange = DateRange()
    #: Per night, in tenge. "Бюджет 25-30" is stored as its lower bound: what
    #: the person will certainly pay, not what we hope to charge.
    budget: Decimal | None = None
    #: "с %" — the poster expects to be paid for passing the guest on.
    commission: bool = False
    #: Only for BLACKLIST, and never shown to a guest.
    phone: str = ""
    note: str = ""

    @property
    def is_actionable(self) -> bool:
        """Whether an operator should be woken up for this."""
        return self.kind in (MessageKind.REQUEST, MessageKind.BLACKLIST)
