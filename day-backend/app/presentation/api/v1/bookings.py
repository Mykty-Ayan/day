"""Booking API endpoints."""

from __future__ import annotations

import re
import uuid
from datetime import date, timedelta
from urllib.parse import quote, urlparse

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.booking.change_booking_status import ChangeBookingStatusService
from app.application.booking.create_booking import (
    CreateBookingInput,
    CreateBookingService,
)
from app.application.booking.get_booking import GetBookingService
from app.application.booking.get_gantt_data import GetGanttDataService
from app.application.booking.list_bookings import ListBookingsService
from app.application.booking.manage_deposits import ManageDepositsService
from app.application.booking.manage_payments import ManagePaymentsService
from app.application.booking.move_booking import MoveBookingService
from app.application.booking.price_calculator import PriceCalculatorService
from app.application.booking.update_booking import (
    UpdateBookingInput,
    UpdateBookingService,
)
from app.config import settings
from app.domain.booking.entities import BookingComment, BookingFile
from app.domain.booking.value_objects import BookingSource, BookingStatus
from app.infrastructure.database import get_session
from app.infrastructure.repositories.booking import (
    SqlBookingAuditLogRepository,
    SqlBookingCommentRepository,
    SqlBookingContractRepository,
    SqlBookingDepositRepository,
    SqlBookingFileRepository,
    SqlBookingPaymentRepository,
    SqlBookingRepository,
    SqlGuestRepository,
)
from app.infrastructure.repositories.property import (
    SqlDiscountRuleRepository,
    SqlPricingConfigRepository,
    SqlPropertyRepository,
    SqlSeasonalPriceRepository,
)
from app.infrastructure.storage.s3 import (
    FileTooLargeError,
    download_booking_file,
    upload_booking_file,
)
from app.presentation.api.deps import get_company_id, get_user_id
from app.presentation.schemas.booking import (
    BookingAuditLogResponse,
    BookingCommentCreate,
    BookingCommentResponse,
    BookingCreate,
    BookingDetailResponse,
    BookingFileResponse,
    BookingListResponse,
    BookingMove,
    BookingResponse,
    BookingStatusChange,
    BookingUpdate,
    DepositAction,
    DepositCreate,
    DepositResponse,
    GanttBookingResponse,
    GanttDataResponse,
    GanttPropertyResponse,
    GuestListResponse,
    GuestResponse,
    PaymentCreate,
    PaymentResponse,
    PriceCalculateRequest,
    PriceCalculateResponse,
    TodayBookingItem,
    TodayCheckResponse,
)

booking_router = APIRouter(prefix="/bookings", tags=["bookings"])
guest_router = APIRouter(prefix="/guests", tags=["guests"])
gantt_router = APIRouter(prefix="/gantt", tags=["gantt"])


# ---------- helpers ----------


def _repos(session: AsyncSession):
    return {
        "booking": SqlBookingRepository(session),
        "guest": SqlGuestRepository(session),
        "property": SqlPropertyRepository(session),
        "payment": SqlBookingPaymentRepository(session),
        "deposit": SqlBookingDepositRepository(session),
        "file": SqlBookingFileRepository(session),
        "comment": SqlBookingCommentRepository(session),
        "contract": SqlBookingContractRepository(session),
        "audit": SqlBookingAuditLogRepository(session),
        "pricing": SqlPricingConfigRepository(session),
        "seasonal": SqlSeasonalPriceRepository(session),
        "discount": SqlDiscountRuleRepository(session),
    }


def _price_calculator(repos):
    return PriceCalculatorService(repos["pricing"], repos["seasonal"], repos["discount"])


def _to_booking_response(
    b,
    guest_name: str | None = None,
    guest_phone: str | None = None,
    property_name: str | None = None,
    property_internal_name: str | None = None,
) -> BookingResponse:
    return BookingResponse(
        id=b.id,
        company_id=b.company_id,
        property_id=b.property_id,
        guest_id=b.guest_id,
        group_booking_id=b.group_booking_id,
        check_in=b.check_in,
        check_out=b.check_out,
        source=b.source,
        status=b.status,
        gantt_color=b.gantt_color,
        gantt_icon=b.gantt_icon,
        total_price=b.total_price,
        calculated_price=b.calculated_price,
        adults_count=b.adults_count,
        children_count=b.children_count,
        notes=b.notes,
        guest_name=guest_name,
        guest_phone=guest_phone,
        property_name=property_name,
        property_internal_name=property_internal_name,
        created_at=b.created_at,
        updated_at=b.updated_at,
    )


def _public_file_url(url: str) -> str:
    if not url:
        return url

    if settings.S3_PUBLIC_ENDPOINT:
        base = settings.S3_PUBLIC_ENDPOINT.rstrip("/")
        path = urlparse(url).path
        return f"{base}{path}"

    parsed = urlparse(url)
    if parsed.hostname == "minio" and parsed.port == 9000:
        return parsed._replace(netloc="localhost:9000").geturl()

    return url


def _to_file_response(f: BookingFile) -> BookingFileResponse:
    return BookingFileResponse(
        id=f.id,
        booking_id=f.booking_id,
        file_url=_public_file_url(f.file_url),
        file_name=f.file_name,
        file_type=f.file_type,
        created_at=f.created_at,
    )


def _content_disposition(filename: str) -> str:
    safe = re.sub(r'[\x00-\x1f\x7f"]+', "", filename).strip()
    if not safe:
        safe = "download"
    fallback = safe.encode("ascii", "ignore").decode("ascii")
    if not fallback:
        fallback = "download"
    encoded = quote(safe)
    return f'attachment; filename="{fallback}"; filename*=UTF-8\'\'{encoded}'


# ---------- Booking CRUD ----------


@booking_router.post("", response_model=BookingResponse, status_code=201)
async def create_booking(
    body: BookingCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
):
    repos = _repos(session)
    svc = CreateBookingService(
        repos["booking"],
        repos["guest"],
        repos["property"],
        repos["audit"],
        _price_calculator(repos),
    )
    try:
        result = await svc.execute(
            CreateBookingInput(
                company_id=company_id,
                property_id=body.property_id,
                guest_name=body.guest_name,
                guest_phone=body.guest_phone,
                guest_email=body.guest_email,
                check_in=body.check_in,
                check_out=body.check_out,
                source=body.source,
                adults_count=body.adults_count,
                children_count=body.children_count,
                gantt_color=body.gantt_color,
                notes=body.notes,
                changed_by=user_id,
            )
        )
        await session.commit()
        return _to_booking_response(result)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@booking_router.get("", response_model=BookingListResponse)
async def list_bookings(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    status: BookingStatus | None = None,
    property_id: uuid.UUID | None = None,
    source: BookingSource | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ListBookingsService(repos["booking"])
    offset = (page - 1) * per_page
    result = await svc.execute(
        company_id,
        offset=offset,
        limit=per_page,
        status=status,
        property_id=property_id,
        source=source,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )

    # Enrich with guest and property names
    items = []
    for b in result.items:
        guest = await repos["guest"].get_by_id(b.guest_id)
        prop = await repos["property"].get_by_id(b.property_id)
        items.append(
            _to_booking_response(
                b,
                guest_name=guest.name if guest else None,
                guest_phone=guest.phone if guest else None,
                property_name=prop.name if prop else None,
                property_internal_name=prop.internal_name if prop else None,
            )
        )

    pages = (result.total + per_page - 1) // per_page if result.total > 0 else 1
    return BookingListResponse(
        items=items,
        total=result.total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@booking_router.get("/today", response_model=TodayCheckResponse)
async def get_today(
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    today = date.today()
    yesterday = today - timedelta(days=1)
    tomorrow = today + timedelta(days=1)

    # Include yesterday->tomorrow overlap so check_out == today is not dropped
    # by half-open interval logic in list_by_company_date_range.
    all_bookings = await repos["booking"].list_by_company_date_range(
        company_id,
        yesterday,
        tomorrow,
    )

    check_ins = []
    check_outs = []
    in_house = []

    for b in all_bookings:
        guest = await repos["guest"].get_by_id(b.guest_id)
        prop = await repos["property"].get_by_id(b.property_id)
        item = TodayBookingItem(
            id=b.id,
            guest_name=guest.name if guest else "Unknown",
            property_name=prop.name if prop else "",
            property_internal_name=prop.internal_name if prop else "",
            check_in=b.check_in,
            check_out=b.check_out,
            status=b.status,
            adults_count=b.adults_count,
            children_count=b.children_count,
        )
        if (
            b.check_in == today
            and b.status in {BookingStatus.PENDING, BookingStatus.CONFIRMED}
        ):
            check_ins.append(item)
        if b.check_out == today and b.status == BookingStatus.CHECKED_IN:
            check_outs.append(item)
        if (
            b.status == BookingStatus.CHECKED_IN
            and b.check_in is not None
            and b.check_out is not None
            and b.check_in <= today < b.check_out
        ):
            in_house.append(item)

    return TodayCheckResponse(
        check_ins=check_ins,
        check_outs=check_outs,
        in_house=in_house,
    )


@booking_router.get("/{booking_id:uuid}", response_model=BookingDetailResponse)
async def get_booking(
    booking_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = GetBookingService(
        repos["booking"],
        repos["guest"],
        repos["property"],
        repos["payment"],
        repos["deposit"],
        repos["file"],
        repos["comment"],
        repos["contract"],
        repos["audit"],
    )
    try:
        detail = await svc.execute(booking_id, company_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Booking not found")

    return BookingDetailResponse(
        booking=_to_booking_response(
            detail.booking,
            guest_name=detail.guest.name if detail.guest else None,
            guest_phone=detail.guest.phone if detail.guest else None,
            property_name=detail.property_name,
            property_internal_name=detail.property_internal_name,
        ),
        guest=GuestResponse.model_validate(detail.guest, from_attributes=True) if detail.guest else None,
        payments=[PaymentResponse.model_validate(p, from_attributes=True) for p in detail.payments],
        deposits=[DepositResponse.model_validate(d, from_attributes=True) for d in detail.deposits],
        files=[_to_file_response(f) for f in detail.files],
        comments=[BookingCommentResponse.model_validate(c, from_attributes=True) for c in detail.comments],
        audit_logs=[BookingAuditLogResponse.model_validate(a, from_attributes=True) for a in detail.audit_logs],
    )


@booking_router.patch("/{booking_id:uuid}", response_model=BookingResponse)
async def update_booking(
    booking_id: uuid.UUID,
    body: BookingUpdate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
):
    repos = _repos(session)
    svc = UpdateBookingService(repos["booking"], repos["audit"], _price_calculator(repos))

    provided = body.model_dump(exclude_unset=True)
    inp = UpdateBookingInput(booking_id=booking_id, company_id=company_id, changed_by=user_id)
    for field_name, value in provided.items():
        setattr(inp, field_name, value)

    try:
        result = await svc.execute(inp)
        await session.commit()
        return _to_booking_response(result)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@booking_router.post("/{booking_id:uuid}/status", response_model=BookingResponse)
async def change_booking_status(
    booking_id: uuid.UUID,
    body: BookingStatusChange,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
):
    repos = _repos(session)
    svc = ChangeBookingStatusService(repos["booking"], repos["audit"])
    try:
        result = await svc.execute(booking_id, company_id, body.target_status, changed_by=user_id)
        await session.commit()
        return _to_booking_response(result)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@booking_router.post("/{booking_id:uuid}/move", response_model=BookingResponse)
async def move_booking(
    booking_id: uuid.UUID,
    body: BookingMove,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
):
    repos = _repos(session)
    svc = MoveBookingService(repos["booking"], repos["property"], repos["audit"])
    try:
        result = await svc.execute(booking_id, company_id, body.target_property_id, changed_by=user_id)
        await session.commit()
        return _to_booking_response(result)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ---------- Price Calculator ----------


@booking_router.post("/calculate-price", response_model=PriceCalculateResponse)
async def calculate_price(
    body: PriceCalculateRequest,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    calc = _price_calculator(repos)
    try:
        result = await calc.calculate(
            body.property_id,
            body.check_in,
            body.check_out,
            body.adults_count,
            body.children_count,
        )
        return PriceCalculateResponse(
            nights=result.nights,
            base_total=result.base_total,
            weekend_surcharge=result.weekend_surcharge,
            seasonal_adjustment=result.seasonal_adjustment,
            extra_guest_surcharge=result.extra_guest_surcharge,
            discount_amount=result.discount_amount,
            total=result.total,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------- Payments ----------


@booking_router.post("/{booking_id:uuid}/payments", response_model=PaymentResponse, status_code=201)
async def add_payment(
    booking_id: uuid.UUID,
    body: PaymentCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManagePaymentsService(repos["booking"], repos["payment"])
    try:
        result = await svc.add_payment(
            booking_id,
            company_id,
            body.amount,
            body.type,
            body.method,
            body.note,
        )
        await session.commit()
        return PaymentResponse.model_validate(result, from_attributes=True)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@booking_router.get("/{booking_id:uuid}/payments", response_model=list[PaymentResponse])
async def list_payments(
    booking_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManagePaymentsService(repos["booking"], repos["payment"])
    try:
        result = await svc.list_payments(booking_id, company_id)
        return [PaymentResponse.model_validate(p, from_attributes=True) for p in result]
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------- Deposits ----------


@booking_router.post("/{booking_id:uuid}/deposits", response_model=DepositResponse, status_code=201)
async def create_deposit(
    booking_id: uuid.UUID,
    body: DepositCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManageDepositsService(repos["booking"], repos["deposit"])
    try:
        result = await svc.create_deposit(booking_id, company_id, body.amount)
        await session.commit()
        return DepositResponse.model_validate(result, from_attributes=True)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@booking_router.post(
    "/{booking_id:uuid}/deposits/{deposit_id}/action",
    response_model=DepositResponse,
)
async def deposit_action(
    booking_id: uuid.UUID,
    deposit_id: uuid.UUID,
    body: DepositAction,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManageDepositsService(repos["booking"], repos["deposit"])
    try:
        result = await svc.perform_action(
            booking_id,
            deposit_id,
            company_id,
            body.action,
            body.held_amount,
            body.reason,
        )
        await session.commit()
        return DepositResponse.model_validate(result, from_attributes=True)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@booking_router.get("/{booking_id:uuid}/deposits", response_model=list[DepositResponse])
async def list_deposits(
    booking_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManageDepositsService(repos["booking"], repos["deposit"])
    try:
        result = await svc.list_deposits(booking_id, company_id)
        return [DepositResponse.model_validate(d, from_attributes=True) for d in result]
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------- Files ----------


@booking_router.post("/{booking_id:uuid}/files", response_model=BookingFileResponse, status_code=201)
async def add_file(
    booking_id: uuid.UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    booking = await repos["booking"].get_by_id(booking_id)
    if booking is None or booking.company_id != company_id:
        raise HTTPException(status_code=404, detail="Booking not found")

    try:
        file_url = await upload_booking_file(
            booking_id=booking_id,
            file_obj=file.file,
            filename=file.filename,
            content_type=file.content_type,
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to upload file")

    result = await repos["file"].create(
        BookingFile(
            booking_id=booking_id,
            file_url=file_url,
            file_name=file.filename or "file",
            file_type=file.content_type or "application/octet-stream",
        )
    )
    await session.commit()
    return _to_file_response(result)


@booking_router.get("/{booking_id:uuid}/files", response_model=list[BookingFileResponse])
async def list_files(
    booking_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    booking = await repos["booking"].get_by_id(booking_id)
    if booking is None or booking.company_id != company_id:
        raise HTTPException(status_code=404, detail="Booking not found")
    result = await repos["file"].list_by_booking(booking_id)
    return [_to_file_response(f) for f in result]


@booking_router.get("/{booking_id:uuid}/files/{file_id}/download")
async def download_file(
    booking_id: uuid.UUID,
    file_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    booking = await repos["booking"].get_by_id(booking_id)
    if booking is None or booking.company_id != company_id:
        raise HTTPException(status_code=404, detail="Booking not found")

    file_rec = await repos["file"].get_by_id(file_id)
    if file_rec is None or file_rec.booking_id != booking_id:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        data, content_type = await download_booking_file(file_url=file_rec.file_url)
    except FileTooLargeError as exc:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {exc.max_bytes} bytes)",
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to download file")

    filename = file_rec.file_name or "file"
    headers = {"Content-Disposition": _content_disposition(filename)}
    return Response(
        content=data,
        media_type=content_type or "application/octet-stream",
        headers=headers,
    )


@booking_router.delete("/{booking_id:uuid}/files/{file_id}", status_code=204)
async def delete_file(
    booking_id: uuid.UUID,
    file_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    booking = await repos["booking"].get_by_id(booking_id)
    if booking is None or booking.company_id != company_id:
        raise HTTPException(status_code=404, detail="Booking not found")
    await repos["file"].delete(file_id)
    await session.commit()


# ---------- Comments ----------


@booking_router.post("/{booking_id:uuid}/comments", response_model=BookingCommentResponse, status_code=201)
async def add_comment(
    booking_id: uuid.UUID,
    body: BookingCommentCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
):
    repos = _repos(session)
    booking = await repos["booking"].get_by_id(booking_id)
    if booking is None or booking.company_id != company_id:
        raise HTTPException(status_code=404, detail="Booking not found")

    result = await repos["comment"].create(
        BookingComment(
            booking_id=booking_id,
            author_id=user_id,
            content=body.content,
        )
    )
    await session.commit()
    return BookingCommentResponse.model_validate(result, from_attributes=True)


@booking_router.get("/{booking_id:uuid}/comments", response_model=list[BookingCommentResponse])
async def list_comments(
    booking_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    booking = await repos["booking"].get_by_id(booking_id)
    if booking is None or booking.company_id != company_id:
        raise HTTPException(status_code=404, detail="Booking not found")
    result = await repos["comment"].list_by_booking(booking_id)
    return [BookingCommentResponse.model_validate(c, from_attributes=True) for c in result]


# ---------- Audit Log ----------


@booking_router.get("/{booking_id:uuid}/audit-log", response_model=list[BookingAuditLogResponse])
async def get_audit_log(
    booking_id: uuid.UUID,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    booking = await repos["booking"].get_by_id(booking_id)
    if booking is None or booking.company_id != company_id:
        raise HTTPException(status_code=404, detail="Booking not found")
    logs = await repos["audit"].list_by_booking(booking_id, offset=offset, limit=limit)
    return [BookingAuditLogResponse.model_validate(entry, from_attributes=True) for entry in logs]


# ---------- Gantt ----------


def _build_gantt_response(result) -> GanttDataResponse:
    return GanttDataResponse(
        properties=[
            GanttPropertyResponse(
                id=p.id,
                name=p.name,
                internal_name=p.internal_name,
                type=p.type,
                bookings=[
                    GanttBookingResponse(
                        id=b.id,
                        guest_name=b.guest_name,
                        check_in=b.check_in,
                        check_out=b.check_out,
                        status=b.status,
                        source=b.source,
                        gantt_color=b.gantt_color,
                        gantt_icon=b.gantt_icon,
                        adults_count=b.adults_count,
                        children_count=b.children_count,
                        total_price=b.total_price,
                    )
                    for b in p.bookings
                ],
            )
            for p in result.properties
        ]
    )


@booking_router.get("/gantt", response_model=GanttDataResponse)
@gantt_router.get("", response_model=GanttDataResponse)
async def get_gantt_data(
    start_date: date = Query(...),
    end_date: date = Query(...),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = GetGanttDataService(repos["property"], repos["booking"], repos["guest"])
    result = await svc.execute(company_id, start_date, end_date)
    return _build_gantt_response(result)


# ---------- Guests ----------


@guest_router.get("", response_model=GuestListResponse)
async def list_guests(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    search: str | None = None,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    guests = await repos["guest"].get_by_company(
        company_id,
        offset=offset,
        limit=limit,
        search=search,
    )
    total = await repos["guest"].count_by_company(company_id, search=search)
    return GuestListResponse(
        items=[GuestResponse.model_validate(g, from_attributes=True) for g in guests],
        total=total,
        offset=offset,
        limit=limit,
    )


@guest_router.get("/{guest_id}", response_model=GuestResponse)
async def get_guest(
    guest_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    guest = await repos["guest"].get_by_id(guest_id)
    if guest is None or guest.company_id != company_id:
        raise HTTPException(status_code=404, detail="Guest not found")
    return GuestResponse.model_validate(guest, from_attributes=True)
