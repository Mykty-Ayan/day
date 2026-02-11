"""SQL implementation of the AnalyticsRepository."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import Integer, Numeric, and_, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.analytics.entities import PropertyMetrics, TimeSeriesPoint
from app.domain.analytics.repositories import AnalyticsRepository
from app.domain.analytics.value_objects import Granularity
from app.infrastructure.models.booking import BookingModel, BookingPaymentModel
from app.infrastructure.models.property import PropertyModel

# Commission rate for platform bookings (Booking.com / Airbnb)
_COMMISSION_RATES: dict[str, Decimal] = {
    "booking": Decimal("0.15"),
    "airbnb": Decimal("0.03"),
}


class SqlAnalyticsRepository(AnalyticsRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_property_metrics(
        self,
        company_id: uuid.UUID,
        date_from: date,
        date_to: date,
        *,
        property_id: uuid.UUID | None = None,
        source: str | None = None,
    ) -> list[PropertyMetrics]:
        total_period_days = (date_to - date_from).days
        if total_period_days <= 0:
            return []

        # Sub-query: payments per booking
        payment_sub = (
            select(
                BookingPaymentModel.booking_id,
                func.coalesce(
                    func.sum(
                        case(
                            (BookingPaymentModel.type == "payment",
                             cast(BookingPaymentModel.amount, Numeric(12, 2))),
                            else_=cast(-BookingPaymentModel.amount, Numeric(12, 2)),
                        )
                    ),
                    0,
                ).label("net_revenue"),
            )
            .where(BookingPaymentModel.status == "completed")
            .group_by(BookingPaymentModel.booking_id)
            .subquery("payments")
        )

        # Clamp booking nights to the analysis period
        eff_check_in = func.greatest(BookingModel.check_in, date_from)
        eff_check_out = func.least(BookingModel.check_out, date_to)
        clamped_nights = func.greatest(
            cast(eff_check_out - eff_check_in, Integer), 0
        )

        # Main query: aggregate per property
        stmt = (
            select(
                PropertyModel.id.label("property_id"),
                PropertyModel.name.label("property_name"),
                PropertyModel.internal_name.label("property_internal_name"),
                func.count(BookingModel.id).label("total_bookings"),
                func.coalesce(func.sum(clamped_nights), 0).label("booked_nights"),
                func.coalesce(
                    func.sum(cast(BookingModel.total_price, Numeric(12, 2))), 0
                ).label("total_price_sum"),
                func.coalesce(func.sum(payment_sub.c.net_revenue), 0).label("revenue"),
                BookingModel.source.label("booking_source"),
            )
            .select_from(PropertyModel)
            .outerjoin(
                BookingModel,
                and_(
                    BookingModel.property_id == PropertyModel.id,
                    BookingModel.status.notin_(["cancelled"]),
                    BookingModel.check_in < date_to,
                    BookingModel.check_out > date_from,
                ),
            )
            .outerjoin(payment_sub, payment_sub.c.booking_id == BookingModel.id)
            .where(PropertyModel.company_id == company_id)
            .where(PropertyModel.status.notin_(["archived"]))
        )

        if property_id is not None:
            stmt = stmt.where(PropertyModel.id == property_id)
        if source is not None:
            stmt = stmt.where(BookingModel.source == source)

        stmt = stmt.group_by(
            PropertyModel.id,
            PropertyModel.name,
            PropertyModel.internal_name,
            BookingModel.source,
        )

        rows = (await self._session.execute(stmt)).all()

        # Merge rows per property (different sources may produce multiple rows)
        props_map: dict[uuid.UUID, PropertyMetrics] = {}
        for row in rows:
            pid = row.property_id
            if pid not in props_map:
                props_map[pid] = PropertyMetrics(
                    property_id=pid,
                    property_name=row.property_name,
                    property_internal_name=row.property_internal_name,
                )
            pm = props_map[pid]

            revenue = Decimal(str(row.revenue or 0))
            booked_nights = int(row.booked_nights or 0)
            total_bookings = int(row.total_bookings or 0)
            booking_source = row.booking_source

            pm.revenue += revenue
            pm.booked_nights += booked_nights
            pm.total_bookings += total_bookings

            # Commission
            rate = _COMMISSION_RATES.get(booking_source or "", Decimal("0"))
            pm.commission += revenue * rate

        # Compute derived metrics
        for pm in props_map.values():
            pm.expenses = pm.commission  # In this phase, expenses = commission
            pm.profit = pm.revenue - pm.expenses
            pm.vacancy_days = max(0, total_period_days - pm.booked_nights)

            if pm.booked_nights > 0:
                pm.adr = pm.revenue / pm.booked_nights
            if total_period_days > 0:
                pm.revpar = pm.revenue / total_period_days
                pm.occupancy_rate = (
                    Decimal(pm.booked_nights) / Decimal(total_period_days) * 100
                )
            if pm.total_bookings > 0:
                pm.avg_stay_duration = Decimal(pm.booked_nights) / pm.total_bookings

        return sorted(props_map.values(), key=lambda p: p.revenue, reverse=True)

    async def get_time_series(
        self,
        company_id: uuid.UUID,
        date_from: date,
        date_to: date,
        granularity: Granularity,
        *,
        property_id: uuid.UUID | None = None,
        source: str | None = None,
    ) -> list[TimeSeriesPoint]:
        # Generate period buckets
        buckets = _generate_buckets(date_from, date_to, granularity)
        if not buckets:
            return []

        # Fetch relevant bookings
        stmt = (
            select(
                BookingModel.check_in,
                BookingModel.check_out,
                BookingModel.total_price,
                BookingModel.property_id,
            )
            .where(
                BookingModel.company_id == company_id,
                BookingModel.status.notin_(["cancelled"]),
                BookingModel.check_in < date_to,
                BookingModel.check_out > date_from,
            )
        )
        if property_id is not None:
            stmt = stmt.where(BookingModel.property_id == property_id)
        if source is not None:
            stmt = stmt.where(BookingModel.source == source)

        rows = (await self._session.execute(stmt)).all()

        # Count active properties
        prop_stmt = (
            select(func.count(PropertyModel.id))
            .where(
                PropertyModel.company_id == company_id,
                PropertyModel.status.notin_(["archived"]),
            )
        )
        if property_id is not None:
            prop_stmt = prop_stmt.where(PropertyModel.id == property_id)
        prop_count = (await self._session.scalar(prop_stmt)) or 1

        # Fill buckets
        result: list[TimeSeriesPoint] = []
        for bucket_start, bucket_end, label in buckets:
            bucket_days = (bucket_end - bucket_start).days
            total_available = bucket_days * prop_count
            revenue = Decimal("0")
            bookings_count = 0
            booked_nights = 0

            for row in rows:
                ci = row.check_in
                co = row.check_out
                # Does this booking overlap the bucket?
                eff_start = max(ci, bucket_start)
                eff_end = min(co, bucket_end)
                nights_in_bucket = (eff_end - eff_start).days
                if nights_in_bucket <= 0:
                    continue

                total_booking_nights = (co - ci).days
                if total_booking_nights > 0:
                    price = Decimal(str(row.total_price or 0))
                    revenue += price * nights_in_bucket / total_booking_nights

                # Count booking if it starts in this bucket
                if bucket_start <= ci < bucket_end:
                    bookings_count += 1

                booked_nights += nights_in_bucket

            occupancy = Decimal("0")
            if total_available > 0:
                occupancy = Decimal(booked_nights) / Decimal(total_available) * 100

            result.append(
                TimeSeriesPoint(
                    period_start=bucket_start,
                    period_label=label,
                    revenue=revenue.quantize(Decimal("0.01")),
                    bookings_count=bookings_count,
                    booked_nights=booked_nights,
                    occupancy_rate=occupancy.quantize(Decimal("0.01")),
                )
            )

        return result


def _generate_buckets(
    date_from: date, date_to: date, granularity: Granularity
) -> list[tuple[date, date, str]]:
    """Generate (start, end, label) tuples for each time bucket."""
    buckets: list[tuple[date, date, str]] = []
    current = date_from

    while current < date_to:
        if granularity == Granularity.DAY:
            end = current + timedelta(days=1)
            label = current.strftime("%b %d")
        elif granularity == Granularity.WEEK:
            end = current + timedelta(days=7)
            label = f"{current.strftime('%b %d')} – {(end - timedelta(days=1)).strftime('%b %d')}"
        else:  # MONTH
            if current.month == 12:
                end = date(current.year + 1, 1, 1)
            else:
                end = date(current.year, current.month + 1, 1)
            label = current.strftime("%b %Y")

        end = min(end, date_to)
        buckets.append((current, end, label))
        current = end

    return buckets
