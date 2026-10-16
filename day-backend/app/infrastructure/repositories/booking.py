from __future__ import annotations

import contextlib
import re
import uuid
from collections.abc import Sequence
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import and_, case, delete, func, select, text, tuple_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.domain.booking.exceptions import BookingOverlapError, IdempotencyKeyTakenError
from app.domain.booking.repositories import (
    BookingAuditLogRepository,
    BookingCommentRepository,
    BookingContractRepository,
    BookingDepositRepository,
    BookingFileRepository,
    BookingPaymentRepository,
    BookingRepository,
    GroupBookingRepository,
    GuestRepository,
)
from app.domain.booking.value_objects import (
    BookingAuditAction,
    BookingSource,
    BookingStatus,
    ContractStatus,
    DepositStatus,
    GroupStatus,
    PaymentMethod,
    PaymentStatus,
    PaymentType,
    RentalMode,
)
from app.infrastructure.models.booking import (
    BookingAuditLogModel,
    BookingCommentModel,
    BookingContractModel,
    BookingDepositModel,
    BookingFileModel,
    BookingModel,
    BookingPaymentModel,
    GroupBookingModel,
    GuestModel,
    VoidedIdempotencyKeyModel,
)

# ---------- helpers ----------


def _model_to_guest(m: GuestModel) -> Guest:
    return Guest(
        id=m.id,
        company_id=m.company_id,
        name=m.name,
        phone=m.phone,
        email=m.email,
        notes=m.notes,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _model_to_booking(m: BookingModel) -> Booking:
    return Booking(
        id=m.id,
        company_id=m.company_id,
        property_id=m.property_id,
        guest_id=m.guest_id,
        group_booking_id=m.group_booking_id,
        check_in=m.check_in,
        check_out=m.check_out,
        rental_mode=RentalMode(m.rental_mode),
        source=BookingSource(m.source),
        status=BookingStatus(m.status),
        gantt_color=m.gantt_color,
        gantt_icon=m.gantt_icon,
        total_price=Decimal(str(m.total_price)),
        calculated_price=Decimal(str(m.calculated_price)),
        adults_count=m.adults_count,
        children_count=m.children_count,
        notes=m.notes,
        overbooking=m.overbooking,
        external_id=m.external_id,
        idempotency_key=m.idempotency_key,
        idempotency_hash=m.idempotency_hash,
        expires_at=m.expires_at,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _model_to_group(m: GroupBookingModel) -> GroupBooking:
    return GroupBooking(
        id=m.id,
        company_id=m.company_id,
        adults_count=m.adults_count,
        children_count=m.children_count,
        status=GroupStatus(m.status),
        notes=m.notes,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _model_to_payment(m: BookingPaymentModel) -> BookingPayment:
    return BookingPayment(
        id=m.id,
        booking_id=m.booking_id,
        amount=Decimal(str(m.amount)),
        type=PaymentType(m.type),
        method=PaymentMethod(m.method),
        status=PaymentStatus(m.status),
        note=m.note,
        paid_at=m.paid_at,
        external_id=m.external_id,
        idempotency_key=m.idempotency_key,
        idempotency_hash=m.idempotency_hash,
        created_at=m.created_at,
    )


def _model_to_deposit(m: BookingDepositModel) -> BookingDeposit:
    return BookingDeposit(
        id=m.id,
        booking_id=m.booking_id,
        amount=Decimal(str(m.amount)),
        status=DepositStatus(m.status),
        held_amount=Decimal(str(m.held_amount)),
        reason=m.reason,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _model_to_file(m: BookingFileModel) -> BookingFile:
    return BookingFile(
        id=m.id,
        booking_id=m.booking_id,
        file_url=m.file_url,
        file_name=m.file_name,
        file_type=m.file_type,
        created_at=m.created_at,
    )


def _model_to_comment(m: BookingCommentModel) -> BookingComment:
    return BookingComment(
        id=m.id,
        booking_id=m.booking_id,
        author_id=m.author_id,
        content=m.content,
        created_at=m.created_at,
    )


def _model_to_contract(m: BookingContractModel) -> BookingContract:
    return BookingContract(
        id=m.id,
        booking_id=m.booking_id,
        template_url=m.template_url,
        generated_url=m.generated_url,
        status=ContractStatus(m.status),
        signed_at=m.signed_at,
        created_at=m.created_at,
    )


def _model_to_audit(m: BookingAuditLogModel) -> BookingAuditLog:
    return BookingAuditLog(
        id=m.id,
        booking_id=m.booking_id,
        changed_by=m.changed_by,
        field_name=m.field_name,
        old_value=m.old_value,
        new_value=m.new_value,
        action=BookingAuditAction(m.action),
        created_at=m.created_at,
    )


_EXCLUSION_VIOLATION = "23P01"
_UNIQUE_VIOLATION = "23505"
_IDEMPOTENCY_INDEXES = {"uq_bookings_company_idempotency_key", "uq_booking_payments_booking_idempotency_key"}


@contextlib.asynccontextmanager
async def _guarded_write(session: AsyncSession):
    """Turn the database's refusals of a booking write into domain errors.

    The write runs in a savepoint, so a refusal rolls back only that write and
    the caller's transaction stays usable for its answer.
    """
    try:
        async with session.begin_nested():
            yield
    except IntegrityError as exc:
        state = getattr(exc.orig, "sqlstate", None)
        if state == _EXCLUSION_VIOLATION:
            raise BookingOverlapError() from exc
        constraint = getattr(exc.orig.__cause__, "constraint_name", None)
        if state == _UNIQUE_VIOLATION and constraint in _IDEMPOTENCY_INDEXES:
            raise IdempotencyKeyTakenError() from exc
        raise


def _digits_only(value: str) -> str:
    return re.sub(r"\D+", "", value)


def _phone_digits_expr():
    # Normalize stored phone values for search without separators.
    expr = func.coalesce(GuestModel.phone, "")
    for ch in ("+", "-", "(", ")", " ", "."):
        expr = func.replace(expr, ch, "")
    return expr


def phone_key(raw: str) -> str:
    """The digits a phone is matched on: 8…/+7…/10 digits become one Kazakh number.

    Twin of _phone_key_expr; change both together. A foreign number keeps its
    digits as typed. normalise_phone (leads) gives the same key for +7 numbers.
    """
    digits = _digits_only(raw)
    if len(digits) == 11 and digits.startswith("8"):
        return "7" + digits[1:]
    if len(digits) == 10:
        return "7" + digits
    return digits


def _phone_key_expr():
    """phone_key computed in SQL over the stored, free-form guests.phone."""
    digits = func.regexp_replace(func.coalesce(GuestModel.phone, ""), r"\D", "", "g")
    return case(
        (and_(func.length(digits) == 11, func.left(digits, 1) == "8"), func.concat("7", func.substr(digits, 2))),
        (func.length(digits) == 10, func.concat("7", digits)),
        else_=digits,
    )


def _guest_search_clause(search: str):
    query = search.strip()
    name_or_raw_phone = (GuestModel.name.ilike(f"%{query}%")) | (
        GuestModel.phone.ilike(f"%{query}%")
    )

    digits = _digits_only(query)
    if not digits:
        return name_or_raw_phone

    return name_or_raw_phone | _phone_digits_expr().ilike(f"%{digits}%")


# ---------- implementations ----------


class SqlGuestRepository(GuestRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, guest: Guest) -> Guest:
        model = GuestModel(
            id=guest.id,
            company_id=guest.company_id,
            name=guest.name,
            phone=guest.phone,
            email=guest.email,
            notes=guest.notes,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_guest(model)

    async def get_by_id(self, guest_id: uuid.UUID) -> Guest | None:
        result = await self._session.get(GuestModel, guest_id)
        return _model_to_guest(result) if result else None

    async def get_by_company(
        self,
        company_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
        search: str | None = None,
    ) -> list[Guest]:
        stmt = select(GuestModel).where(GuestModel.company_id == company_id)
        if search:
            stmt = stmt.where(_guest_search_clause(search))
        stmt = stmt.order_by(GuestModel.created_at.desc()).offset(offset).limit(limit)
        result = await self._session.scalars(stmt)
        return [_model_to_guest(m) for m in result.all()]

    async def count_by_company(
        self, company_id: uuid.UUID, *, search: str | None = None
    ) -> int:
        stmt = select(func.count()).select_from(GuestModel).where(
            GuestModel.company_id == company_id
        )
        if search:
            stmt = stmt.where(_guest_search_clause(search))
        result = await self._session.scalar(stmt)
        return result or 0

    async def search_by_name_or_phone(
        self, company_id: uuid.UUID, query: str
    ) -> list[Guest]:
        stmt = (
            select(GuestModel)
            .where(
                GuestModel.company_id == company_id,
                _guest_search_clause(query),
            )
            .limit(20)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_guest(m) for m in result.all()]

    async def list_by_phone(self, company_id: uuid.UUID, phone: str) -> list[Guest]:
        # Computed over the company's guests (company_id index); add a stored,
        # indexed key column if a company grows past tens of thousands of guests.
        key = phone_key(phone)
        if not key:
            return []
        stmt = (
            select(GuestModel)
            .where(GuestModel.company_id == company_id, _phone_key_expr() == key)
            .order_by(GuestModel.created_at, GuestModel.id)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_guest(m) for m in result.all()]

    async def find_by_phone(
        self, company_id: uuid.UUID, phone: str
    ) -> Guest | None:
        # Earlier bookings may have left duplicates of one guest; the oldest wins.
        guests = await self.list_by_phone(company_id, phone)
        return guests[0] if guests else None


class SqlBookingRepository(BookingRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, booking: Booking) -> Booking:
        model = BookingModel(
            id=booking.id,
            company_id=booking.company_id,
            property_id=booking.property_id,
            guest_id=booking.guest_id,
            group_booking_id=booking.group_booking_id,
            check_in=booking.check_in,
            check_out=booking.check_out,
            rental_mode=booking.rental_mode.value,
            source=booking.source.value,
            status=booking.status.value,
            gantt_color=booking.gantt_color,
            gantt_icon=booking.gantt_icon,
            total_price=float(booking.total_price),
            calculated_price=float(booking.calculated_price),
            adults_count=booking.adults_count,
            children_count=booking.children_count,
            notes=booking.notes,
            overbooking=booking.overbooking,
            external_id=booking.external_id,
            idempotency_key=booking.idempotency_key,
            idempotency_hash=booking.idempotency_hash,
            expires_at=booking.expires_at,
        )
        async with _guarded_write(self._session):
            self._session.add(model)
            await self._session.flush()
        await self._session.refresh(model)
        return _model_to_booking(model)

    async def get_by_id(self, booking_id: uuid.UUID) -> Booking | None:
        result = await self._session.get(BookingModel, booking_id)
        return _model_to_booking(result) if result else None

    async def get_for_update(self, booking_id: uuid.UUID) -> Booking | None:
        # populate_existing: the row may already sit in this session from an
        # earlier read; the locked read must replace it, not return it stale.
        stmt = (
            select(BookingModel)
            .where(BookingModel.id == booking_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        result = await self._session.scalar(stmt)
        return _model_to_booking(result) if result else None

    async def lock_idempotency_key(self, company_id: uuid.UUID, key: str) -> None:
        # Held until the transaction ends. A second request with the same key
        # waits here, then finds the first one's booking instead of racing it
        # into the constraints (where the two can deadlock).
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"),
            {"k": f"booking-idempotency:{company_id}:{key}"},
        )

    async def lock_property_calendar(self, property_id: uuid.UUID) -> None:
        # Same kind of lock as lock_idempotency_key, held until commit.
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"),
            {"k": f"booking-property:{property_id}"},
        )

    async def get_by_idempotency_key(self, company_id: uuid.UUID, key: str) -> Booking | None:
        result = await self._session.scalar(
            select(BookingModel).where(
                BookingModel.company_id == company_id,
                BookingModel.idempotency_key == key,
            )
        )
        return _model_to_booking(result) if result else None

    async def void_idempotency_key(self, company_id: uuid.UUID, key: str) -> None:
        # Under the key's lock nothing else voids or uses it, so checking first is enough.
        if not await self.idempotency_key_voided(company_id, key):
            self._session.add(VoidedIdempotencyKeyModel(company_id=company_id, booking_id=None, key=key))
            await self._session.flush()

    async def idempotency_key_voided(self, company_id: uuid.UUID, key: str) -> bool:
        found = await self._session.scalar(
            select(VoidedIdempotencyKeyModel.id).where(
                VoidedIdempotencyKeyModel.company_id == company_id,
                VoidedIdempotencyKeyModel.booking_id.is_(None),
                VoidedIdempotencyKeyModel.key == key,
            )
        )
        return found is not None

    async def get_by_property_and_dates(
        self,
        property_id: uuid.UUID,
        check_in: date,
        check_out: date,
        *,
        exclude_id: uuid.UUID | None = None,
        include_completed: bool = False,
    ) -> list[Booking]:
        stmt = select(BookingModel).where(
            BookingModel.property_id == property_id,
            BookingModel.status.notin_(["cancelled"] if include_completed else ["cancelled", "completed"]),
            BookingModel.check_in < check_out,
            BookingModel.check_out > check_in,
        )
        if exclude_id is not None:
            stmt = stmt.where(BookingModel.id != exclude_id)
        result = await self._session.scalars(stmt)
        return [_model_to_booking(m) for m in result.all()]

    def _apply_filters(
        self,
        stmt,
        *,
        status=None,
        property_id=None,
        source=None,
        search=None,
        date_from=None,
        date_to=None,
    ):
        if status is not None:
            stmt = stmt.where(BookingModel.status == status.value)
        if property_id is not None:
            stmt = stmt.where(BookingModel.property_id == property_id)
        if source is not None:
            stmt = stmt.where(BookingModel.source == source.value)
        if search and search.strip():
            stmt = stmt.join(GuestModel, BookingModel.guest_id == GuestModel.id).where(
                _guest_search_clause(search)
            )
        if date_from is not None:
            stmt = stmt.where(BookingModel.check_out >= date_from)
        if date_to is not None:
            stmt = stmt.where(BookingModel.check_in <= date_to)
        return stmt

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
    ) -> list[Booking]:
        stmt = select(BookingModel).where(BookingModel.company_id == company_id)
        stmt = self._apply_filters(
            stmt, status=status, property_id=property_id,
            source=source, search=search, date_from=date_from, date_to=date_to,
        )
        stmt = stmt.order_by(BookingModel.check_in.desc()).offset(offset).limit(limit)
        result = await self._session.scalars(stmt)
        return [_model_to_booking(m) for m in result.all()]

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
    ) -> int:
        stmt = select(func.count()).select_from(BookingModel).where(
            BookingModel.company_id == company_id
        )
        stmt = self._apply_filters(
            stmt, status=status, property_id=property_id,
            source=source, search=search, date_from=date_from, date_to=date_to,
        )
        result = await self._session.scalar(stmt)
        return result or 0

    async def list_by_property_date_range(
        self,
        property_id: uuid.UUID,
        start_date: date,
        end_date: date,
        *,
        company_id: uuid.UUID | None = None,
    ) -> list[Booking]:
        stmt = (
            select(BookingModel)
            .where(
                BookingModel.property_id == property_id,
                BookingModel.status.notin_(["cancelled"]),
                BookingModel.check_in < end_date,
                BookingModel.check_out > start_date,
            )
            .order_by(BookingModel.check_in)
        )
        if company_id is not None:
            stmt = stmt.where(BookingModel.company_id == company_id)
        result = await self._session.scalars(stmt)
        return [_model_to_booking(m) for m in result.all()]

    async def list_by_company_date_range(
        self,
        company_id: uuid.UUID,
        start_date: date,
        end_date: date,
    ) -> list[Booking]:
        stmt = (
            select(BookingModel)
            .where(
                BookingModel.company_id == company_id,
                BookingModel.status.notin_(["cancelled"]),
                BookingModel.check_in < end_date,
                BookingModel.check_out > start_date,
            )
            .order_by(BookingModel.check_in)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_booking(m) for m in result.all()]

    async def list_changed(
        self,
        company_id: uuid.UUID,
        *,
        after: tuple[datetime, uuid.UUID],
        until: datetime,
        limit: int,
    ) -> list[Booking]:
        # Served by the company_id index plus a sort. Fine for hundreds of
        # bookings per company; add an index on (company_id, updated_at, id)
        # when a company grows past tens of thousands.
        stmt = (
            select(BookingModel)
            .where(
                BookingModel.company_id == company_id,
                tuple_(BookingModel.updated_at, BookingModel.id) > tuple_(*after),
                BookingModel.updated_at <= until,
            )
            .order_by(BookingModel.updated_at, BookingModel.id)
            .limit(limit)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_booking(m) for m in result.all()]

    async def list_expired_holds(self, now: datetime, *, limit: int) -> list[Booking]:
        # A system sweep across every company: each hold is cancelled within
        # its own company, and nothing here is shown to a caller. Rows stay
        # locked until the sweep commits; SKIP LOCKED lets several API
        # instances sweep at once without taking the same hold twice.
        # A hold with money on it is never swept: a write racing the payment
        # can put a paid booking back to pending, and cancelling it would
        # release nights the guest has paid for.
        paid = (
            select(BookingPaymentModel.id)
            .where(
                BookingPaymentModel.booking_id == BookingModel.id,
                BookingPaymentModel.type == PaymentType.PAYMENT.value,
                BookingPaymentModel.status == PaymentStatus.COMPLETED.value,
            )
            .exists()
        )
        stmt = (
            select(BookingModel)
            .where(
                BookingModel.status == BookingStatus.PENDING.value,
                BookingModel.expires_at.is_not(None),
                BookingModel.expires_at <= now,
                ~paid,
            )
            .order_by(BookingModel.expires_at)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_booking(m) for m in result.all()]

    async def update(self, booking: Booking) -> Booking:
        stmt = (
            update(BookingModel)
            .where(BookingModel.id == booking.id)
            .values(
                property_id=booking.property_id,
                guest_id=booking.guest_id,
                group_booking_id=booking.group_booking_id,
                check_in=booking.check_in,
                check_out=booking.check_out,
                rental_mode=booking.rental_mode.value,
                source=booking.source.value,
                status=booking.status.value,
                gantt_color=booking.gantt_color,
                gantt_icon=booking.gantt_icon,
                total_price=float(booking.total_price),
                calculated_price=float(booking.calculated_price),
                adults_count=booking.adults_count,
                children_count=booking.children_count,
                notes=booking.notes,
                overbooking=booking.overbooking,
                expires_at=booking.expires_at,
                updated_at=datetime.utcnow(),
            )
        )
        async with _guarded_write(self._session):
            await self._session.execute(stmt)
        await self._session.flush()
        result = await self._session.get(BookingModel, booking.id)
        return _model_to_booking(result)  # type: ignore[arg-type]

    async def touch(self, booking_id: uuid.UUID) -> None:
        await self._session.execute(
            update(BookingModel).where(BookingModel.id == booking_id).values(updated_at=datetime.utcnow())
        )


class SqlGroupBookingRepository(GroupBookingRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, group: GroupBooking) -> GroupBooking:
        model = GroupBookingModel(
            id=group.id,
            company_id=group.company_id,
            adults_count=group.adults_count,
            children_count=group.children_count,
            status=group.status.value,
            notes=group.notes,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_group(model)

    async def get_by_id(self, group_id: uuid.UUID) -> GroupBooking | None:
        result = await self._session.get(GroupBookingModel, group_id)
        return _model_to_group(result) if result else None

    async def list_by_company(
        self, company_id: uuid.UUID, *, offset: int = 0, limit: int = 50
    ) -> list[GroupBooking]:
        stmt = (
            select(GroupBookingModel)
            .where(GroupBookingModel.company_id == company_id)
            .order_by(GroupBookingModel.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_group(m) for m in result.all()]


class SqlBookingPaymentRepository(BookingPaymentRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, payment: BookingPayment) -> BookingPayment:
        model = BookingPaymentModel(
            id=payment.id,
            booking_id=payment.booking_id,
            amount=float(payment.amount),
            type=payment.type.value,
            method=payment.method.value,
            status=payment.status.value,
            note=payment.note,
            paid_at=payment.paid_at,
            external_id=payment.external_id,
            idempotency_key=payment.idempotency_key,
            idempotency_hash=payment.idempotency_hash,
        )
        async with _guarded_write(self._session):
            self._session.add(model)
            await self._session.flush()
        await self._session.refresh(model)
        return _model_to_payment(model)

    async def lock_idempotency_key(self, booking_id: uuid.UUID, key: str) -> None:
        # Same reason as SqlBookingRepository.lock_idempotency_key.
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"),
            {"k": f"payment-idempotency:{booking_id}:{key}"},
        )

    async def get_by_idempotency_key(self, booking_id: uuid.UUID, key: str) -> BookingPayment | None:
        result = await self._session.scalar(
            select(BookingPaymentModel).where(
                BookingPaymentModel.booking_id == booking_id,
                BookingPaymentModel.idempotency_key == key,
            )
        )
        return _model_to_payment(result) if result else None

    async def void_idempotency_key(self, company_id: uuid.UUID, booking_id: uuid.UUID, key: str) -> None:
        # Same reason as SqlBookingRepository.void_idempotency_key.
        if not await self.idempotency_key_voided(booking_id, key):
            self._session.add(VoidedIdempotencyKeyModel(company_id=company_id, booking_id=booking_id, key=key))
            await self._session.flush()

    async def idempotency_key_voided(self, booking_id: uuid.UUID, key: str) -> bool:
        found = await self._session.scalar(
            select(VoidedIdempotencyKeyModel.id).where(
                VoidedIdempotencyKeyModel.booking_id == booking_id,
                VoidedIdempotencyKeyModel.key == key,
            )
        )
        return found is not None

    async def update(self, payment: BookingPayment) -> BookingPayment:
        await self._session.execute(
            update(BookingPaymentModel)
            .where(BookingPaymentModel.id == payment.id)
            .values(status=payment.status.value, paid_at=payment.paid_at)
        )
        await self._session.flush()
        result = await self._session.get(BookingPaymentModel, payment.id, populate_existing=True)
        return _model_to_payment(result)  # type: ignore[arg-type]

    async def list_by_booking(self, booking_id: uuid.UUID) -> list[BookingPayment]:
        stmt = (
            select(BookingPaymentModel)
            .where(BookingPaymentModel.booking_id == booking_id)
            .order_by(BookingPaymentModel.created_at.desc())
        )
        result = await self._session.scalars(stmt)
        return [_model_to_payment(m) for m in result.all()]

    async def get_by_id(self, payment_id: uuid.UUID) -> BookingPayment | None:
        result = await self._session.get(BookingPaymentModel, payment_id)
        return _model_to_payment(result) if result else None

    async def sum_paid_by_bookings(self, booking_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
        if not booking_ids:
            return {}
        # Refunds count against what was received, so the sign is decided in SQL
        # rather than by summing two columns in Python.
        signed = case(
            (BookingPaymentModel.type == PaymentType.REFUND.value, -BookingPaymentModel.amount),
            else_=BookingPaymentModel.amount,
        )
        stmt = (
            select(BookingPaymentModel.booking_id, func.coalesce(func.sum(signed), 0))
            .where(
                BookingPaymentModel.booking_id.in_(booking_ids),
                # A pending payment is money promised, not received.
                BookingPaymentModel.status == PaymentStatus.COMPLETED.value,
            )
            .group_by(BookingPaymentModel.booking_id)
        )
        rows = await self._session.execute(stmt)
        return {booking_id: Decimal(str(total)) for booking_id, total in rows.all()}


class SqlBookingDepositRepository(BookingDepositRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, deposit: BookingDeposit) -> BookingDeposit:
        model = BookingDepositModel(
            id=deposit.id,
            booking_id=deposit.booking_id,
            amount=float(deposit.amount),
            status=deposit.status.value,
            held_amount=float(deposit.held_amount),
            reason=deposit.reason,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_deposit(model)

    async def get_by_booking(self, booking_id: uuid.UUID) -> list[BookingDeposit]:
        stmt = (
            select(BookingDepositModel)
            .where(BookingDepositModel.booking_id == booking_id)
            .order_by(BookingDepositModel.created_at.desc())
        )
        result = await self._session.scalars(stmt)
        return [_model_to_deposit(m) for m in result.all()]

    async def get_by_id(self, deposit_id: uuid.UUID) -> BookingDeposit | None:
        result = await self._session.get(BookingDepositModel, deposit_id)
        return _model_to_deposit(result) if result else None

    async def update(self, deposit: BookingDeposit) -> BookingDeposit:
        stmt = (
            update(BookingDepositModel)
            .where(BookingDepositModel.id == deposit.id)
            .values(
                status=deposit.status.value,
                held_amount=float(deposit.held_amount),
                reason=deposit.reason,
                updated_at=datetime.utcnow(),
            )
        )
        await self._session.execute(stmt)
        await self._session.flush()
        result = await self._session.get(BookingDepositModel, deposit.id)
        return _model_to_deposit(result)  # type: ignore[arg-type]


class SqlBookingFileRepository(BookingFileRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, file: BookingFile) -> BookingFile:
        model = BookingFileModel(
            id=file.id,
            booking_id=file.booking_id,
            file_url=file.file_url,
            file_name=file.file_name,
            file_type=file.file_type,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_file(model)

    async def get_by_id(self, file_id: uuid.UUID) -> BookingFile | None:
        result = await self._session.get(BookingFileModel, file_id)
        return _model_to_file(result) if result else None

    async def list_by_booking(self, booking_id: uuid.UUID) -> list[BookingFile]:
        stmt = (
            select(BookingFileModel)
            .where(BookingFileModel.booking_id == booking_id)
            .order_by(BookingFileModel.created_at.desc())
        )
        result = await self._session.scalars(stmt)
        return [_model_to_file(m) for m in result.all()]

    async def delete(self, file_id: uuid.UUID) -> None:
        stmt = delete(BookingFileModel).where(BookingFileModel.id == file_id)
        await self._session.execute(stmt)
        await self._session.flush()


class SqlBookingCommentRepository(BookingCommentRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, comment: BookingComment) -> BookingComment:
        model = BookingCommentModel(
            id=comment.id,
            booking_id=comment.booking_id,
            author_id=comment.author_id,
            content=comment.content,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_comment(model)

    async def list_by_booking(self, booking_id: uuid.UUID) -> list[BookingComment]:
        stmt = (
            select(BookingCommentModel)
            .where(BookingCommentModel.booking_id == booking_id)
            .order_by(BookingCommentModel.created_at.desc())
        )
        result = await self._session.scalars(stmt)
        return [_model_to_comment(m) for m in result.all()]


class SqlBookingContractRepository(BookingContractRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, contract: BookingContract) -> BookingContract:
        model = BookingContractModel(
            id=contract.id,
            booking_id=contract.booking_id,
            template_url=contract.template_url,
            generated_url=contract.generated_url,
            status=contract.status.value,
            signed_at=contract.signed_at,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_contract(model)

    async def get_by_booking(self, booking_id: uuid.UUID) -> BookingContract | None:
        stmt = select(BookingContractModel).where(
            BookingContractModel.booking_id == booking_id
        )
        result = await self._session.scalar(stmt)
        return _model_to_contract(result) if result else None

    async def update(self, contract: BookingContract) -> BookingContract:
        stmt = (
            update(BookingContractModel)
            .where(BookingContractModel.id == contract.id)
            .values(
                template_url=contract.template_url,
                generated_url=contract.generated_url,
                status=contract.status.value,
                signed_at=contract.signed_at,
            )
        )
        await self._session.execute(stmt)
        await self._session.flush()
        result = await self._session.get(BookingContractModel, contract.id)
        return _model_to_contract(result)  # type: ignore[arg-type]


class SqlBookingAuditLogRepository(BookingAuditLogRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, log: BookingAuditLog) -> BookingAuditLog:
        model = BookingAuditLogModel(
            id=log.id,
            booking_id=log.booking_id,
            changed_by=log.changed_by,
            field_name=log.field_name,
            old_value=log.old_value,
            new_value=log.new_value,
            action=log.action.value,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_audit(model)

    async def list_by_booking(
        self,
        booking_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
    ) -> list[BookingAuditLog]:
        stmt = (
            select(BookingAuditLogModel)
            .where(BookingAuditLogModel.booking_id == booking_id)
            .order_by(BookingAuditLogModel.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_audit(m) for m in result.all()]
