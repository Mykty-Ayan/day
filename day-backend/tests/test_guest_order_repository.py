"""Guests' orders in PostgreSQL: a number per company in order, reads within the
company, a status move that only one of two hands at once can make, a payment
that a stale hand never writes over, and what a guest owes for the minibar."""

import asyncio
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.main  # noqa: E402,F401  (every model registered, for the foreign keys)
from app.config import settings
from app.domain.inventory.entities import (
    GuestOrder,
    GuestOrderItem,
    OrderBilling,
    OrderPayment,
    OrderPaymentStatus,
    OrderStatus,
)

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


def _order(company, prop, booking, product, quantity=2, billing=OrderBilling.INVOICE):
    return GuestOrder(company_id=company, booking_id=booking, property_id=prop, total=Decimal(800 * quantity),
                      billing=billing,
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
        *(_in_session(lambda repo: repo.move(mine[0], order.id, {OrderStatus.NEW}, order, None)) for _ in range(3))
    )
    assert sum(m is not None for m in moves) == 1
    # Another company's hand moves nothing.
    elsewhere = await _in_session(lambda repo: repo.move(uuid.uuid4(), order.id, {OrderStatus.DELIVERED}, order, None))
    assert elsewhere is None


async def test_a_guest_owes_only_for_orders_on_the_tab():
    mine = await _company_with_a_booking()
    company, _, booking, _ = mine
    tab = await _in_session(lambda repo: repo.add(_order(*mine, quantity=1)))
    paid = await _in_session(lambda repo: repo.add(_order(*mine, quantity=2)))
    await _in_session(lambda repo: repo.add(_order(*mine, quantity=3)))  # not delivered yet
    for order, status in ((tab, OrderPaymentStatus.ON_BOOKING), (paid, OrderPaymentStatus.PAID)):
        order.status, order.payment_status = OrderStatus.DELIVERED, status
        order.payment_method = OrderPayment.CASH if status == OrderPaymentStatus.PAID else None
        assert await _in_session(lambda repo, o=order: repo.move(company, o.id, {OrderStatus.NEW}, o, None)) is not None

    assert await _in_session(lambda repo: repo.due_by_bookings(company, [booking])) == {booking: Decimal("800")}
    # Another company asking about the same booking hears nothing.
    assert await _in_session(lambda repo: repo.due_by_bookings(uuid.uuid4(), [booking])) == {}
    [stored] = [o for o in await _in_session(lambda repo: repo.list(company)) if o.id == tab.id]
    assert (stored.payment_status, stored.payment_method) == (OrderPaymentStatus.ON_BOOKING, None)


async def test_two_identical_orders_at_once_make_one():
    # A double tap: both requests hold the booking's lock in turn, and the second finds
    # the first among the booking's new orders before adding its own.
    mine = await _company_with_a_booking()

    async def place(repo):
        await repo.hold(mine[2])
        prior = await repo.recent_new(mine[2], datetime.utcnow() - timedelta(minutes=1))
        if prior:
            return prior[0]
        await asyncio.sleep(0.2)  # the other request is waiting on the lock meanwhile
        return await repo.add(_order(*mine))

    placed = await asyncio.gather(_in_session(place), _in_session(place))
    assert placed[0].id == placed[1].id
    assert len(await _in_session(lambda repo: repo.list(mine[0]))) == 1
    # Only new orders of this booking count as a repeat.
    other = await _company_with_a_booking()
    assert await _in_session(lambda repo: repo.recent_new(other[2], datetime.utcnow() - timedelta(minutes=1))) == []


async def test_a_payment_recorded_meanwhile_is_never_lost():
    company, prop, booking, product = mine = await _company_with_a_booking()
    order = await _in_session(lambda repo: repo.add(_order(*mine)))
    order.status = OrderStatus.AWAITING_PAYMENT
    await _in_session(lambda repo: repo.move(company, order.id, {OrderStatus.NEW}, order, None))
    stale = await _in_session(lambda repo: repo.get(company, order.id))

    # Host B: the Kaspi invoice is paid.
    paid = await _in_session(lambda repo: repo.get(company, order.id))
    paid.status, paid.payment_status, paid.payment_method = (
        OrderStatus.ACCEPTED, OrderPaymentStatus.PAID, OrderPayment.KASPI
    )
    assert await _in_session(lambda repo: repo.move(company, order.id, {OrderStatus.AWAITING_PAYMENT}, paid, None))
    # Host A, on what it read before: delivered on the tab. Refused; the payment stays.
    stale.status, stale.payment_status = OrderStatus.DELIVERED, OrderPaymentStatus.ON_BOOKING
    allowed = {OrderStatus.NEW, OrderStatus.AWAITING_PAYMENT, OrderStatus.ACCEPTED}
    assert await _in_session(lambda repo: repo.move(company, order.id, allowed, stale, None)) is None
    # Even a hand that names the payment it read cannot write a stored paid over.
    stale.payment_status = None
    assert await _in_session(
        lambda repo: repo.move(company, order.id, allowed, stale, OrderPaymentStatus.PAID)
    ) is None
    kept = await _in_session(lambda repo: repo.get(company, order.id))
    assert (kept.status, kept.payment_status, kept.payment_method) == (
        OrderStatus.ACCEPTED, OrderPaymentStatus.PAID, OrderPayment.KASPI
    )


async def test_the_minibar_with_the_booking_is_owed_once_the_host_confirmed_it():
    company, prop, booking, product = mine = await _company_with_a_booking()

    async def placed(quantity, status, payment=None, billing=OrderBilling.BOOKING):
        order = await _in_session(lambda repo: repo.add(_order(*mine, quantity=quantity, billing=billing)))
        order.status, order.payment_status = status, payment
        return await _in_session(lambda repo: repo.move(company, order.id, {OrderStatus.NEW}, order, None))

    await placed(1, OrderStatus.NEW)  # not confirmed: not owed yet
    accepted = await placed(2, OrderStatus.ACCEPTED)  # 1 600
    await placed(3, OrderStatus.DELIVERED, OrderPaymentStatus.ON_BOOKING)  # 2 400
    await placed(4, OrderStatus.DELIVERED, OrderPaymentStatus.PAID)
    await placed(5, OrderStatus.CANCELLED)
    await placed(6, OrderStatus.AWAITING_PAYMENT, billing=OrderBilling.INVOICE)
    await placed(7, OrderStatus.DELIVERED, OrderPaymentStatus.ON_BOOKING, billing=OrderBilling.INVOICE)  # 5 600
    assert await _in_session(lambda repo: repo.due_by_bookings(company, [booking])) == {booking: Decimal("9600")}

    # Delivered without payment: owed once, the same amount.
    accepted.status, accepted.payment_status = OrderStatus.DELIVERED, OrderPaymentStatus.ON_BOOKING
    assert await _in_session(lambda repo: repo.move(company, accepted.id, {OrderStatus.ACCEPTED}, accepted, None))
    assert await _in_session(lambda repo: repo.due_by_bookings(company, [booking])) == {booking: Decimal("9600")}


async def test_the_downgrade_of_059_turns_kaspi_into_a_transfer():
    import importlib.util
    from pathlib import Path

    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    company, prop, booking, product = mine = await _company_with_a_booking()
    order = await _in_session(lambda repo: repo.add(_order(*mine)))
    order.status, order.payment_status, order.payment_method = (
        OrderStatus.ACCEPTED, OrderPaymentStatus.PAID, OrderPayment.KASPI
    )
    await _in_session(lambda repo: repo.move(company, order.id, {OrderStatus.NEW}, order, None))

    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "059_guest_order_billing.py"
    spec = importlib.util.spec_from_file_location("migration_059", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    def _down(sync_conn):
        with Operations.context(MigrationContext.configure(sync_conn)):
            module.downgrade()

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            trans = await conn.begin()
            try:
                await conn.run_sync(_down)
                method = (await conn.execute(
                    sa.text("SELECT payment_method FROM guest_orders WHERE id = :id"), {"id": order.id}
                )).scalar_one()
                assert method == "transfer"
            finally:
                await trans.rollback()
    finally:
        await engine.dispose()
