"""Whether anyone has warned us about this guest.

Colleagues post numbers into the groups with a line about what went wrong:
"Прокурили всю кв,пятна,срач", "Всю квартиру засрали и шумели всю ночь". One of
them mentions a 200 000 ₸ fine for letting the wrong people in — several nights
of revenue from a flat.

This warns; it never refuses. The warning is hearsay from a group chat, a
number can be reassigned or mistyped, and a system that blocked a booking on it
would be wrong in a way the operator could not overrule. It also never travels
back to the guest: the groups are explicit that passing their contents on is
what gets people removed, and once got someone sued.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass

from app.domain.leads.entities import BlacklistedGuest
from app.domain.leads.repositories import BlacklistRepository


@dataclass(frozen=True)
class GuestWarning:
    phone: str
    reason: str

    @property
    def for_operator(self) -> str:
        tail = f": {self.reason}" if self.reason else ""
        return f"Коллеги предупреждали об этом номере{tail}"


def normalise_phone(raw: str | None) -> str:
    """+7XXXXXXXXXX, or empty when it is not a number we can match on.

    Numbers arrive typed by hand, pasted from WhatsApp, and read out of group
    messages by a model. Matching on the digits is the only way a warning posted
    as "+7 778 682 3184" ever meets a booking saved as "87786823184".
    """
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    if len(digits) == 10:
        digits = "7" + digits
    return f"+{digits}" if len(digits) == 11 and digits.startswith("7") else ""


class CheckGuestService:
    def __init__(self, blacklist: BlacklistRepository) -> None:
        self._blacklist = blacklist

    async def execute(self, company_id: uuid.UUID, phone: str | None) -> GuestWarning | None:
        normalised = normalise_phone(phone)
        if not normalised:
            return None
        entry: BlacklistedGuest | None = await self._blacklist.find(company_id, normalised)
        if entry is None:
            return None
        return GuestWarning(phone=entry.phone, reason=entry.reason)
