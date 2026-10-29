"""Use case: correct a guest's name or phone."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.booking.entities import Guest
from app.domain.booking.repositories import GuestRepository


class GuestNotFound(LookupError):
    pass


class GuestPhoneTaken(ValueError):
    """Another guest of the company has this number: two records of one phone
    split a guest's history and send their pages to the wrong record."""

    def __init__(self) -> None:
        super().__init__("Another guest of the company has this phone")


@dataclass
class UpdateGuestInput:
    company_id: uuid.UUID
    guest_id: uuid.UUID
    # None: leave as it is.
    name: str | None = None
    # None: leave as it is; "": the guest has no phone.
    phone: str | None = None


class UpdateGuestService:
    def __init__(self, guest_repo: GuestRepository) -> None:
        self._guests = guest_repo

    async def execute(self, inp: UpdateGuestInput) -> Guest:
        guest = await self._guests.get_by_id(inp.guest_id)
        if guest is None or guest.company_id != inp.company_id:
            raise GuestNotFound("Guest not found")

        if inp.name is not None:
            name = inp.name.strip()
            if not name:
                raise ValueError("The guest needs a name")
            guest.name = name

        if inp.phone is not None:
            # Stored as typed, like a phone given with a booking; matched on its digits.
            phone = inp.phone.strip() or None
            # The same number sent back is no change: an old duplicate is not this edit's doing.
            if phone is not None and phone != guest.phone:
                if any(g.id != guest.id for g in await self._guests.list_by_phone(inp.company_id, phone)):
                    raise GuestPhoneTaken()
            guest.phone = phone

        return await self._guests.update(guest)
