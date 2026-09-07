"""Wiring the assistant's tools to the same services the API routes use.

Nothing here grants new authority: every callable ends in a use case the
operator's own token could already reach, scoped to their company.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.analytics.calculate_metrics import CalculateMetricsInput, CalculateMetricsService
from app.application.assistant.tools import ToolContext, build_tools
from app.application.booking.check_availability import CheckAvailabilityService
from app.application.booking.create_booking import CreateBookingInput, CreateBookingService
from app.application.booking.manage_payments import ManagePaymentsService
from app.application.booking.price_calculator import PriceCalculatorService
from app.application.booking.update_booking import UpdateBookingInput, UpdateBookingService
from app.application.cleaning.create_task import CreateCleaningTaskInput, CreateCleaningTaskService
from app.domain.booking.value_objects import PaymentMethod, PaymentType
from app.infrastructure.repositories.analytics import SqlAnalyticsRepository
from app.infrastructure.repositories.booking import (
    SqlBookingAuditLogRepository,
    SqlBookingPaymentRepository,
    SqlBookingRepository,
    SqlGuestRepository,
)
from app.infrastructure.repositories.cleaning import SqlCleaningTaskRepository
from app.infrastructure.repositories.property import (
    SqlDiscountRuleRepository,
    SqlPricingConfigRepository,
    SqlPropertyCostsRepository,
    SqlPropertyRepository,
    SqlSeasonalPriceRepository,
)


def build_assistant_tools(
    session: AsyncSession,
    company_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
    today: date | None = None,
):
    bookings = SqlBookingRepository(session)
    guests = SqlGuestRepository(session)
    properties = SqlPropertyRepository(session)
    payments = SqlBookingPaymentRepository(session)
    audit = SqlBookingAuditLogRepository(session)
    prices = PriceCalculatorService(
        SqlPricingConfigRepository(session),
        SqlSeasonalPriceRepository(session),
        SqlDiscountRuleRepository(session),
    )

    create_booking = CreateBookingService(bookings, guests, properties, audit, prices)
    update_booking = UpdateBookingService(bookings, properties, audit, prices)
    manage_payments = ManagePaymentsService(bookings, payments)
    create_cleaning = CreateCleaningTaskService(SqlCleaningTaskRepository(session), properties)
    metrics = CalculateMetricsService(SqlAnalyticsRepository(session), SqlPropertyCostsRepository(session))

    async def _create_booking(**kwargs):
        return await create_booking.execute(
            CreateBookingInput(
                company_id=kwargs["company_id"],
                property_id=kwargs["property_id"],
                guest_name=kwargs["guest_name"],
                guest_phone=kwargs.get("guest_phone") or None,
                check_in=kwargs["check_in"],
                check_out=kwargs["check_out"],
                adults_count=2,
                changed_by=user_id,
            )
        )

    async def _update_booking(**kwargs):
        return await update_booking.execute(
            UpdateBookingInput(
                booking_id=kwargs["booking_id"],
                company_id=kwargs["company_id"],
                check_out=kwargs["check_out"],
                changed_by=user_id,
            )
        )

    async def _add_payment(**kwargs):
        try:
            method = PaymentMethod(str(kwargs.get("method") or "transfer"))
        except ValueError:
            method = PaymentMethod.TRANSFER
        return await manage_payments.add_payment(
            kwargs["booking_id"],
            kwargs["company_id"],
            Decimal(str(kwargs["amount"])),
            PaymentType.PAYMENT,
            method,
        )

    async def _create_cleaning(**kwargs):
        return await create_cleaning.execute(
            CreateCleaningTaskInput(
                company_id=kwargs["company_id"],
                property_id=kwargs["property_id"],
                scheduled_date=kwargs["scheduled_date"],
                scheduled_time=_read_time(kwargs.get("scheduled_time")),
            )
        )

    class _Metrics:
        async def execute(self, company, date_from, date_to):
            result = await metrics.execute(
                CalculateMetricsInput(company_id=company, date_from=date_from, date_to=date_to)
            )
            summary = result.summary
            return {
                "revenue": float(summary.total_revenue),
                "bookings": summary.total_bookings,
                "occupancy_rate": float(summary.overall_occupancy_rate),
                "adr": float(summary.overall_adr),
            }

    context = ToolContext(
        company_id,
        availability_service=CheckAvailabilityService(properties, bookings, prices),
        booking_repo=bookings,
        guest_repo=guests,
        property_repo=properties,
        create_booking_service=_create_booking,
        update_booking_service=_update_booking,
        payment_service=_add_payment,
        cleaning_service=_create_cleaning,
        metrics_service=_Metrics(),
        today=today,
    )
    return build_tools(context)


def _read_time(value: object) -> time | None:
    """"12:00" from a model, a real time from a form — accept either."""
    if isinstance(value, time):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.strptime(value.strip()[:5], "%H:%M").time()
        except ValueError:
            return None
    return None
