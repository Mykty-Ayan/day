from __future__ import annotations

import abc
import uuid
from datetime import date

from app.domain.booking.entities import (
    Booking,
    BookingAuditLog,
    BookingComment,
    BookingContract,
    BookingDeposit,
    BookingFile,
    BookingPayment,
    GroupBooking,
    Guest,
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
    async def find_by_phone(
        self, company_id: uuid.UUID, phone: str
    ) -> Guest | None: ...


class BookingRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, booking: Booking) -> Booking: ...

    @abc.abstractmethod
    async def get_by_id(self, booking_id: uuid.UUID) -> Booking | None: ...

    @abc.abstractmethod
    async def get_by_property_and_dates(
        self,
        property_id: uuid.UUID,
        check_in: date,
        check_out: date,
        *,
        exclude_id: uuid.UUID | None = None,
    ) -> list[Booking]: ...

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
    async def update(self, booking: Booking) -> Booking: ...


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
