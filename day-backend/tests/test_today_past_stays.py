"""What Today digs out of the past: a debt however old, a stay nobody closed."""

import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.main  # noqa: E402,F401  (every model registered, for the foreign keys)
from app.config import settings

pytestmark = pytest.mark.integration

TODAY = date(2030, 12, 10)


async def _company():
    from app.infrastructure.models.auth import CompanyModel
    from app.infrastructure.models.booking import GuestModel
    from app.infrastructure.models.property import PropertyModel
    from tests.test_property_tag_filter import _seed

    company, flat, guest = (uuid.uuid4() for _ in range(3))
    await _seed(
        CompanyModel(id=company, name=f"Past stays {company.hex[:6]}"),
        PropertyModel(id=flat, company_id=company, name="Т13", internal_name="t13", type="apartment",
                      status="active", rental_mode="daily"),
        GuestModel(id=guest, company_id=company, name="Жалгас"),
    )
    return company, flat, guest


async def _stay(ids, status, check_in, check_out, total=40000, paid=0, refunded=0):
    from app.infrastructure.models.booking import BookingModel, BookingPaymentModel
    from tests.test_property_tag_filter import _seed

    company, flat, guest = ids
    stay = uuid.uuid4()
    rows = [BookingModel(id=stay, company_id=company, property_id=flat, guest_id=guest, check_in=check_in,
                         check_out=check_out, status=status, total_price=Decimal(total))]
    for amount, kind in ((paid, "payment"), (refunded, "refund")):
        if amount:
            rows.append(BookingPaymentModel(booking_id=stay, amount=Decimal(amount), type=kind, method="cash",
                                            status="completed"))
    await _seed(*rows)
    return stay


async def _read(work):
    from app.infrastructure.repositories.booking import SqlBookingRepository

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            return await work(SqlBookingRepository(session))
    finally:
        await engine.dispose()


async def test_a_debt_is_found_however_old_and_only_a_real_one():
    ids = await _company()
    in_nov, out_nov = datetime(2030, 11, 1, 14), datetime(2030, 11, 3, 12)
    old = await _stay(ids, "checked_out", datetime(2028, 1, 1, 14), datetime(2028, 1, 3, 12), paid=10000)
    refunded = await _stay(ids, "completed", in_nov, out_nov, paid=40000, refunded=5000)
    tab = await _stay(ids, "completed", in_nov, out_nov, paid=40000)
    left_early = await _stay(ids, "checked_out", datetime(2030, 12, 10, 14), datetime(2030, 12, 14, 12))
    await _stay(ids, "completed", in_nov, out_nov, paid=40000)
    await _stay(ids, "pending", in_nov, out_nov)
    await _stay(ids, "cancelled", in_nov, out_nov)
    await _stay(ids, "confirmed", datetime(2030, 12, 8, 14), datetime(2030, 12, 10, 12))
    other_company = await _stay(await _company(), "checked_out", in_nov, out_nov)

    found = await _read(lambda repo: repo.list_ended_owing(ids[0], TODAY, [tab, other_company]))

    assert {b.id for b in found} == {old, refunded, tab, left_early}
    assert found[-1].id == old


async def test_a_stay_nobody_closed_is_found_within_the_company():
    ids = await _company()
    still_in = await _stay(ids, "checked_in", datetime(2030, 11, 1, 14), datetime(2030, 11, 3, 12))
    never_in = await _stay(ids, "confirmed", datetime(2030, 11, 5, 14), datetime(2030, 11, 8, 12))
    await _stay(ids, "checked_in", datetime(2030, 12, 8, 14), datetime(2030, 12, 10, 12))
    await _stay(ids, "confirmed", datetime(2030, 12, 10, 14), datetime(2030, 12, 12, 12))
    await _stay(ids, "checked_out", datetime(2030, 11, 10, 14), datetime(2030, 11, 12, 12))
    await _stay(await _company(), "checked_in", datetime(2030, 12, 1, 14), datetime(2030, 12, 9, 12))

    found = await _read(lambda repo: repo.list_unclosed(ids[0], TODAY))

    assert {b.id for b in found} == {still_in, never_in}
