"""Guests' orders in PostgreSQL: a number per company in order, reads within the
company, and a status move that only one of two hands at once can make."""

import asyncio
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.main  # noqa: E402,F401  (every model registered, for the foreign keys)
from app.config import settings
from app.domain.inventory.entities import GuestOrder, GuestOrderItem, OrderStatus

pytestmark = pytest.mark.integration


async def _company_with_a_booking():
    """A company, a flat, a booking and a product; their ids."""
    from app.infrastructure.models.auth import CompanyModel
    from app.infrastructure.models.booking import BookingModel, GuestModel
    from app.infrastructure.models.inventory import ProductModel
    from app.infrastructure.models.property import PropertyModel
    from tests.test_property_tag_filter import _seed

    company, prop, guest, booking, product = (uuid.uuid4() for _ in range(5))
    await _seed(
        CompanyModel(id=company, name=f"Orders repo {company.hex[:6]}"),
        PropertyModel(id=prop, company_id=company, name="Т13", internal_name="t13", type="apartment",
                      status="active", rental_mode="daily"),
        GuestModel(id=guest, company_id=company, name="Жалгас"),
        BookingModel(id=booking, company_id=company, property_id=prop, guest_id=guest,
                     check_in=datetime(2030, 12, 1, 14), check_out=datetime(2030, 12, 3, 12), status="confirmed"),
        ProductModel(id=product, company_id=company, name="Кола", price=800),
    )
    return company, prop, booking, product


def _order(company, prop, booking, product, quantity=2):
    return GuestOrder(company_id=company, booking_id=booking, property_id=prop, total=Decimal(800 * quantity),
                      items=[GuestOrderItem(product_id=product, name="Кола", price=Decimal("800"), quantity=quantity)])


async def _in_session(work):
    from app.infrastructure.repositories.inventory import SqlGuestOrderRepository

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            result = await work(SqlGuestOrderRepository(session))
            await session.commit()
            return result
    finally:
        await engine.dispose()


async def test_orders_are_numbered_per_company_even_when_placed_at_once():
    mine, theirs = await _company_with_a_booking(), await _company_with_a_booking()

    placed = await asyncio.gather(*(_in_session(lambda repo: repo.add(_order(*mine))) for _ in range(4)))
    other = await _in_session(lambda repo: repo.add(_order(*theirs)))

    assert sorted(o.number for o in placed) == [1, 2, 3, 4]
    assert other.number == 1
    assert placed[0].items[0].name == "Кола" and placed[0].total == Decimal("1600")


async def test_reads_stay_within_the_company_and_count_the_bookings_last_hour():
    mine, theirs = await _company_with_a_booking(), await _company_with_a_booking()
    order = await _in_session(lambda repo: repo.add(_order(*mine)))

    assert await _in_session(lambda repo: repo.get(theirs[0], order.id)) is None
    assert await _in_session(lambda repo: repo.list(theirs[0])) == []
    assert [o.id for o in await _in_session(lambda repo: repo.list(mine[0], status=OrderStatus.NEW))] == [order.id]
    assert await _in_session(lambda repo: repo.list(mine[0], status=OrderStatus.DELIVERED)) == []
    since = datetime.utcnow() - timedelta(hours=1)
    assert await _in_session(lambda repo: repo.count_since(mine[2], since)) == 1


async def test_of_two_moves_at_once_only_one_lands():
    mine = await _company_with_a_booking()
    order = await _in_session(lambda repo: repo.add(_order(*mine)))
    order.status, order.delivered_at = OrderStatus.DELIVERED, datetime.utcnow()

    moves = await asyncio.gather(
        *(_in_session(lambda repo: repo.move(mine[0], order.id, {OrderStatus.NEW}, order)) for _ in range(3))
    )
    assert sum(m is not None for m in moves) == 1
    # Another company's hand moves nothing.
    assert await _in_session(lambda repo: repo.move(uuid.uuid4(), order.id, {OrderStatus.DELIVERED}, order)) is None
