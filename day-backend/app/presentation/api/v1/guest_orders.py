"""Guests' minibar orders, for the host: the list, accept, delivered (paid), cancel.

Seeing them goes with bookings:read, handling them with bookings:write.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.inventory.guest_orders import GuestOrderService
from app.domain.auth.permissions import Permission
from app.domain.inventory.entities import GuestOrder, OrderStatus
from app.infrastructure.database import get_session
from app.infrastructure.repositories.booking import SqlBookingRepository, SqlGuestRepository
from app.infrastructure.repositories.property import SqlPropertyRepository
from app.presentation.api.deps import Principal, get_company_id, get_principal, require
from app.presentation.api.v1.public import guest_orders
from app.presentation.schemas.guest_orders import GuestOrderDeliver, GuestOrderResponse

guest_order_router = APIRouter(prefix="/guest-orders", tags=["guest-orders"])

_read = [Depends(require(Permission.BOOKINGS_READ))]
_write = [Depends(require(Permission.BOOKINGS_WRITE))]


async def _responses(session: AsyncSession, orders: list[GuestOrder]) -> list[GuestOrderResponse]:
    """With the flat's and the guest's names, looked up once each."""
    props, bookings, guests = SqlPropertyRepository(session), SqlBookingRepository(session), SqlGuestRepository(session)
    flats: dict[uuid.UUID, str | None] = {}
    names: dict[uuid.UUID, str | None] = {}
    out = []
    for order in orders:
        if order.property_id not in flats:
            prop = await props.get_by_id(order.property_id)
            flats[order.property_id] = prop.internal_name or prop.name if prop else None
        if order.booking_id not in names:
            booking = await bookings.get_by_id(order.booking_id)
            guest = await guests.get_by_id(booking.guest_id) if booking else None
            names[order.booking_id] = guest.name if guest else None
        out.append(
            GuestOrderResponse.model_validate(order, from_attributes=True).model_copy(
                update={"property_name": flats[order.property_id], "guest_name": names[order.booking_id]}
            )
        )
    return out


async def _handled(session: AsyncSession, call) -> GuestOrderResponse:
    try:
        order = await call
    except LookupError:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    await session.commit()
    return (await _responses(session, [order]))[0]


@guest_order_router.get("", response_model=list[GuestOrderResponse], dependencies=_read)
async def list_orders(
    status_: OrderStatus | None = Query(default=None, alias="status"),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    service: GuestOrderService = guest_orders(session)
    return await _responses(session, list(await service.list(company_id, status=status_)))


@guest_order_router.post("/{order_id}/accept", response_model=GuestOrderResponse, dependencies=_write)
async def accept_order(
    order_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    return await _handled(session, guest_orders(session).accept(company_id, order_id, principal.actor_id))


@guest_order_router.post("/{order_id}/deliver", response_model=GuestOrderResponse, dependencies=_write)
async def deliver_order(
    order_id: uuid.UUID,
    body: GuestOrderDeliver,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    """Delivered and paid at the door: the stock goes down by each line."""
    service = guest_orders(session)
    return await _handled(session, service.deliver(company_id, order_id, body.payment_method, principal.actor_id))


@guest_order_router.post("/{order_id}/cancel", response_model=GuestOrderResponse, dependencies=_write)
async def cancel_order(
    order_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    return await _handled(session, guest_orders(session).cancel(company_id, order_id, principal.actor_id))
