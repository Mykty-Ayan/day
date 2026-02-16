from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import delete, func, select, update
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
        source=BookingSource(m.source),
        status=BookingStatus(m.status),
        gantt_color=m.gantt_color,
        gantt_icon=m.gantt_icon,
        total_price=Decimal(str(m.total_price)),
        calculated_price=Decimal(str(m.calculated_price)),
        adults_count=m.adults_count,
        children_count=m.children_count,
        notes=m.notes,
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


def _digits_only(value: str) -> str:
    return re.sub(r"\D+", "", value)


def _phone_digits_expr():
    # Normalize stored phone values for search without separators.
    expr = func.coalesce(GuestModel.phone, "")
    for ch in ("+", "-", "(", ")", " ", "."):
        expr = func.replace(expr, ch, "")
    return expr


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

    async def find_by_phone(
        self, company_id: uuid.UUID, phone: str
    ) -> Guest | None:
        stmt = select(GuestModel).where(
            GuestModel.company_id == company_id,
            GuestModel.phone == phone,
        )
        result = await self._session.scalar(stmt)
        return _model_to_guest(result) if result else None


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
            source=booking.source.value,
            status=booking.status.value,
            gantt_color=booking.gantt_color,
            gantt_icon=booking.gantt_icon,
            total_price=float(booking.total_price),
            calculated_price=float(booking.calculated_price),
            adults_count=booking.adults_count,
            children_count=booking.children_count,
            notes=booking.notes,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_booking(model)

    async def get_by_id(self, booking_id: uuid.UUID) -> Booking | None:
        result = await self._session.get(BookingModel, booking_id)
        return _model_to_booking(result) if result else None

    async def get_by_property_and_dates(
        self,
        property_id: uuid.UUID,
        check_in: date,
        check_out: date,
        *,
        exclude_id: uuid.UUID | None = None,
    ) -> list[Booking]:
        stmt = select(BookingModel).where(
            BookingModel.property_id == property_id,
            BookingModel.status.notin_(["cancelled", "completed"]),
            BookingModel.check_in < check_out,
            BookingModel.check_out > check_in,
        )
        if exclude_id is not None:
            stmt = stmt.where(BookingModel.id != exclude_id)
        result = await self._session.scalars(stmt)
        return [_model_to_booking(m) for m in result.all()]

    def _apply_filters(self, stmt, *, status=None, property_id=None, source=None, date_from=None, date_to=None):
        if status is not None:
            stmt = stmt.where(BookingModel.status == status.value)
        if property_id is not None:
            stmt = stmt.where(BookingModel.property_id == property_id)
        if source is not None:
            stmt = stmt.where(BookingModel.source == source.value)
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
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[Booking]:
        stmt = select(BookingModel).where(BookingModel.company_id == company_id)
        stmt = self._apply_filters(
            stmt, status=status, property_id=property_id,
            source=source, date_from=date_from, date_to=date_to,
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
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(BookingModel).where(
            BookingModel.company_id == company_id
        )
        stmt = self._apply_filters(
            stmt, status=status, property_id=property_id,
            source=source, date_from=date_from, date_to=date_to,
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
                source=booking.source.value,
                status=booking.status.value,
                gantt_color=booking.gantt_color,
                gantt_icon=booking.gantt_icon,
                total_price=float(booking.total_price),
                calculated_price=float(booking.calculated_price),
                adults_count=booking.adults_count,
                children_count=booking.children_count,
                notes=booking.notes,
                updated_at=datetime.utcnow(),
            )
        )
        await self._session.execute(stmt)
        await self._session.flush()
        result = await self._session.get(BookingModel, booking.id)
        return _model_to_booking(result)  # type: ignore[arg-type]


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
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_payment(model)

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
