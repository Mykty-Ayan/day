from __future__ import annotations

import abc
import uuid
from collections.abc import Sequence
from datetime import date, datetime
from decimal import Decimal

from app.domain.booking.entities import (
    Booking,
    BookingAuditLog,
    BookingComment,
    BookingContract,
    BookingDeposit,
    BookingFile,
    BookingPayment,
    CalendarFeed,
    GroupBooking,
    Guest,
    GuestOffer,
    PropertyBlock,
)
from app.domain.booking.value_objects import BookingSource, BookingStatus


class GuestRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, guest: Guest) -> Guest: ...

    @abc.abstractmethod
    async def get_by_id(self, guest_id: uuid.UUID) -> Guest | None: ...

    @abc.abstractmethod
    async def get_by_company(
        self,
        company_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
        search: str | None = None,
    ) -> list[Guest]: ...

    @abc.abstractmethod
    async def count_by_company(
        self, company_id: uuid.UUID, *, search: str | None = None
    ) -> int: ...

    @abc.abstractmethod
    async def search_by_name_or_phone(
        self, company_id: uuid.UUID, query: str
    ) -> list[Guest]: ...

    @abc.abstractmethod
    async def list_by_phone(self, company_id: uuid.UUID, phone: str) -> list[Guest]:
        """Guests whose phone is this number however either was written, oldest first."""

    @abc.abstractmethod
    async def find_by_phone(
        self, company_id: uuid.UUID, phone: str
    ) -> Guest | None: ...


class BookingRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, booking: Booking) -> Booking: ...

    @abc.abstractmethod
    async def get_by_id(self, booking_id: uuid.UUID) -> Booking | None: ...

    @abc.abstractmethod
    async def lock_idempotency_key(self, company_id: uuid.UUID, key: str) -> None:
        """Serialize requests carrying one Idempotency-Key until the transaction ends."""

    @abc.abstractmethod
    async def get_by_idempotency_key(self, company_id: uuid.UUID, key: str) -> Booking | None: ...

    @abc.abstractmethod
    async def void_idempotency_key(self, company_id: uuid.UUID, key: str) -> None:
        """Close a key that made no booking. Call under lock_idempotency_key."""

    @abc.abstractmethod
    async def idempotency_key_voided(self, company_id: uuid.UUID, key: str) -> bool: ...

    @abc.abstractmethod
    async def get_by_property_and_dates(
        self,
        property_id: uuid.UUID,
        check_in: date,
        check_out: date,
        *,
        exclude_id: uuid.UUID | None = None,
        include_completed: bool = False,
    ) -> list[Booking]:
        """The flat's active bookings in the range. `include_completed` adds the
        completed ones: a stay that ended early still needs its cleaning."""

    # The flat's closed nights (blocks) live in its calendar with its bookings.
    # A store without blocks has none; only the SQL one writes them.

    async def list_blocks(self, property_id: uuid.UUID, date_from: date, date_to: date) -> list[PropertyBlock]:
        """The flat's blocks with a night in [date_from, date_to)."""
        return []

    async def list_company_blocks(self, company_id: uuid.UUID, date_from: date, date_to: date) -> list[PropertyBlock]:
        """Every flat's blocks of the company with a night in [date_from, date_to)."""
        return []

    async def add_block(self, block: PropertyBlock) -> PropertyBlock:
        raise NotImplementedError

    async def get_block(self, block_id: uuid.UUID) -> PropertyBlock | None:
        return None

    async def delete_block(self, block_id: uuid.UUID) -> None:
        raise NotImplementedError

    async def list_feed_blocks(self, feed_id: uuid.UUID) -> list[PropertyBlock]:
        """The blocks taken from one platform calendar."""
        return []

    async def lock_property_calendar(self, property_id: uuid.UUID) -> None:  # noqa: B027  (no-op unless SQL)
        """Serialize the checks of one flat's neighbours until the transaction ends:
        two bookings at once must not both find the flat free of a buffer."""

    @abc.abstractmethod
    async def list_by_company(
        self,
        company_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
        status: BookingStatus | None = None,
        property_id: uuid.UUID | None = None,
        source: BookingSource | None = None,
        search: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        agent_id: uuid.UUID | None = None,
    ) -> list[Booking]: ...

    @abc.abstractmethod
    async def count_by_company(
        self,
        company_id: uuid.UUID,
        *,
        status: BookingStatus | None = None,
        property_id: uuid.UUID | None = None,
        source: BookingSource | None = None,
        search: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        agent_id: uuid.UUID | None = None,
    ) -> int: ...

    @abc.abstractmethod
    async def list_by_property_date_range(
        self,
        property_id: uuid.UUID,
        start_date: date,
        end_date: date,
        *,
        company_id: uuid.UUID | None = None,
    ) -> list[Booking]: ...

    @abc.abstractmethod
    async def list_by_company_date_range(
        self,
        company_id: uuid.UUID,
        start_date: date,
        end_date: date,
    ) -> list[Booking]: ...

    @abc.abstractmethod
    async def list_changed(
        self,
        company_id: uuid.UUID,
        *,
        after: tuple[datetime, uuid.UUID],
        until: datetime,
        limit: int,
    ) -> list[Booking]:
        """Bookings with (updated_at, id) > after and updated_at <= until, in that order."""

    @abc.abstractmethod
    async def list_expired_holds(self, now: datetime, *, limit: int) -> list[Booking]:
        """Pending bookings of every company whose expires_at <= now, locked for the caller."""

    async def has_live_hold(
        self, company_id: uuid.UUID, guest_ids: list[uuid.UUID], source: str, now: datetime
    ) -> bool:
        """Whether one of these guests has a pending booking from `source` that still holds its dates."""
        raise NotImplementedError

    async def count_live_holds(self, property_id: uuid.UUID, source: str, now: datetime) -> int:
        """The flat's pending bookings from `source` that still hold their dates."""
        raise NotImplementedError

    @abc.abstractmethod
    async def update(self, booking: Booking) -> Booking: ...

    @abc.abstractmethod
    async def get_for_update(self, booking_id: uuid.UUID) -> Booking | None:
        """The current booking, locked until the transaction ends."""

    @abc.abstractmethod
    async def touch(self, booking_id: uuid.UUID) -> None:
        """Mark the booking changed (moves it up the feed) without rewriting it."""


class GroupBookingRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, group: GroupBooking) -> GroupBooking: ...

    @abc.abstractmethod
    async def get_by_id(self, group_id: uuid.UUID) -> GroupBooking | None: ...

    @abc.abstractmethod
    async def list_by_company(
        self, company_id: uuid.UUID, *, offset: int = 0, limit: int = 50
    ) -> list[GroupBooking]: ...


class BookingPaymentRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, payment: BookingPayment) -> BookingPayment: ...

    @abc.abstractmethod
    async def list_by_booking(self, booking_id: uuid.UUID) -> list[BookingPayment]: ...

    @abc.abstractmethod
    async def get_by_id(self, payment_id: uuid.UUID) -> BookingPayment | None: ...

    @abc.abstractmethod
    async def lock_idempotency_key(self, booking_id: uuid.UUID, key: str) -> None:
        """Serialize requests carrying one Idempotency-Key until the transaction ends."""

    @abc.abstractmethod
    async def get_by_idempotency_key(self, booking_id: uuid.UUID, key: str) -> BookingPayment | None: ...

    @abc.abstractmethod
    async def void_idempotency_key(self, company_id: uuid.UUID, booking_id: uuid.UUID, key: str) -> None:
        """Close a key that recorded no payment. Call under lock_idempotency_key."""

    @abc.abstractmethod
    async def idempotency_key_voided(self, booking_id: uuid.UUID, key: str) -> bool: ...

    @abc.abstractmethod
    async def update(self, payment: BookingPayment) -> BookingPayment: ...

    @abc.abstractmethod
    async def sum_paid_by_bookings(self, booking_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
        """Net amount received per booking: payments less refunds.

        A list of bookings needs one figure each, and asking per booking turns a
        single screen into fifty round trips.
        """
        ...


class BookingDepositRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, deposit: BookingDeposit) -> BookingDeposit: ...

    @abc.abstractmethod
    async def get_by_booking(self, booking_id: uuid.UUID) -> list[BookingDeposit]: ...

    @abc.abstractmethod
    async def get_by_id(self, deposit_id: uuid.UUID) -> BookingDeposit | None: ...

    @abc.abstractmethod
    async def update(self, deposit: BookingDeposit) -> BookingDeposit: ...


class BookingFileRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, file: BookingFile) -> BookingFile: ...

    @abc.abstractmethod
    async def get_by_id(self, file_id: uuid.UUID) -> BookingFile | None: ...

    @abc.abstractmethod
    async def list_by_booking(self, booking_id: uuid.UUID) -> list[BookingFile]: ...

    @abc.abstractmethod
    async def delete(self, file_id: uuid.UUID) -> None: ...


class BookingCommentRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, comment: BookingComment) -> BookingComment: ...

    @abc.abstractmethod
    async def list_by_booking(self, booking_id: uuid.UUID) -> list[BookingComment]: ...


class BookingContractRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, contract: BookingContract) -> BookingContract: ...

    @abc.abstractmethod
    async def get_by_booking(self, booking_id: uuid.UUID) -> BookingContract | None: ...

    @abc.abstractmethod
    async def update(self, contract: BookingContract) -> BookingContract: ...


class BookingAuditLogRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, log: BookingAuditLog) -> BookingAuditLog: ...

    @abc.abstractmethod
    async def list_by_booking(
        self,
        booking_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
    ) -> list[BookingAuditLog]: ...


class CalendarFeedRepository(abc.ABC):
    @abc.abstractmethod
    async def add(self, feed: CalendarFeed) -> CalendarFeed: ...

    @abc.abstractmethod
    async def get(self, feed_id: uuid.UUID) -> CalendarFeed | None: ...

    @abc.abstractmethod
    async def list_for_property(self, property_id: uuid.UUID) -> list[CalendarFeed]: ...

    @abc.abstractmethod
    async def list_all(self) -> list[CalendarFeed]:
        """Every company's calendars, for the timer."""

    @abc.abstractmethod
    async def delete(self, feed_id: uuid.UUID) -> None:
        """With its blocks."""

    @abc.abstractmethod
    async def record_sync(self, feed_id: uuid.UUID, synced_at: datetime, error: str | None) -> None: ...


class GuestOfferRepository(abc.ABC):
    @abc.abstractmethod
    async def add(self, offer: GuestOffer) -> GuestOffer: ...

    @abc.abstractmethod
    async def get_by_code(self, code: str, *, lock: bool = False) -> GuestOffer | None:
        """The offer behind a link's code, of any company: the code is the key.
        `lock` holds its row until commit, so two bookings by one link go one by one."""

    @abc.abstractmethod
    async def set_booking(self, offer_id: uuid.UUID, booking_id: uuid.UUID) -> None: ...
