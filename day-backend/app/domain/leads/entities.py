"""A lead we read in someone else's chat, and a guest we were warned about.

Both come from the same place — the colleagues' WhatsApp groups — and both have
a short shelf life for opposite reasons. A request for tonight is worthless by
morning. A warning about a guest is worth keeping, but it is hearsay from a
group chat, so it must never be shown to the guest it names or treated as proof
of anything: it is a reason to look twice, not a verdict.
"""

from __future__ import annotations

import enum
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal


class LeadStatus(str, enum.Enum):
    #: Read and matched, nobody has acted yet.
    NEW = "new"
    #: The operator sent the colleague an offer.
    ANSWERED = "answered"
    #: The colleague said they had enough — "достаточно", "гость выбрал".
    CLOSED = "closed"
    #: Check-in has passed. Nothing to answer any more.
    EXPIRED = "expired"


#: A request nobody touched stops being worth showing after this. Leads in these
#: groups are taken within minutes — "Первому отдала" — so a day-old one is a
#: record, not a task.
STALE_AFTER = timedelta(days=1)


@dataclass
class Lead:
    """A colleague's request for a flat, as we stored it."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    #: The group it was posted in, so a closing message can find its request.
    chat_id: str = ""
    #: Who posted it. The answer goes to them privately, never to the group.
    author: str = ""
    #: The message as written. Kept because every parse is a guess, and an
    #: operator deciding on a lead should be able to read the original.
    text: str = ""
    district: str = ""
    guests: int | None = None
    rooms_min: int | None = None
    rooms_max: int | None = None
    check_in: date | None = None
    nights: int | None = None
    budget: Decimal | None = None
    commission: bool = False
    status: LeadStatus = LeadStatus.NEW
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def is_stale(self, now: datetime) -> bool:
        """Whether this is still worth putting in front of a person."""
        if self.status in (LeadStatus.CLOSED, LeadStatus.EXPIRED):
            return True
        if self.check_in is not None and self.check_in < now.date():
            return True
        if self.created_at is not None and now - self.created_at > STALE_AFTER:
            return True
        return False


@dataclass
class BlacklistedGuest:
    """A phone number a colleague warned about.

    Scoped to a company like everything else here. The warning was shared in a
    group, but what we keep is our own record of it — and the groups are
    explicit that passing it back to guests is what gets people removed, and
    once got someone sued.
    """

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    #: Normalised to +7XXXXXXXXXX so a match does not depend on formatting.
    phone: str = ""
    reason: str = ""
    #: Where it came from: a group chat id, or empty when an operator added it.
    source: str = ""
    created_at: datetime | None = None
