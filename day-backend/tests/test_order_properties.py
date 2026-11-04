"""The company's flats in its own order on the chessboard, and back to the order by name."""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.application.property.order_properties import OrderPropertiesService
from app.config import settings
from app.domain.auth.permissions import Permission
from app.domain.property.entities import Property
from app.infrastructure.models.property import PropertyModel
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_property_services import FakePropertyRepository
from tests.test_property_tag_filter import _company_of, _flat, _seed

COMPANY = uuid.uuid4()


class _OrderingRepo(FakePropertyRepository):
    """Records how the order is written: positions only, never a whole card."""

    def __init__(self) -> None:
        super().__init__()
        self.cards_written = 0

    async def update(self, prop: Property) -> Property:
        self.cards_written += 1
        return await super().update(prop)


async def _flats(repo: FakePropertyRepository, *names: str, company: uuid.UUID = COMPANY) -> list[Property]:
    return [await repo.save(Property(company_id=company, name=name, internal_name=name)) for name in names]


async def test_the_flats_take_the_order_given_and_the_rest_go_by_name():
    repo = _OrderingRepo()
    a, b, c = await _flats(repo, "Кв. 12", "Кв. 15", "Лофт 5")
    await OrderPropertiesService(repo).execute(COMPANY, [c.id, a.id])
    assert [(await repo.get_by_id(f.id)).position for f in (a, b, c)] == [1, None, 0]


async def test_an_empty_list_puts_every_flat_back_in_order_by_name():
    repo = FakePropertyRepository()
    a, b = await _flats(repo, "Кв. 12", "Кв. 15")
    await OrderPropertiesService(repo).execute(COMPANY, [b.id, a.id])
    await OrderPropertiesService(repo).execute(COMPANY, [])
    assert [(await repo.get_by_id(f.id)).position for f in (a, b)] == [None, None]


async def test_a_flat_listed_twice_is_refused():
    repo = FakePropertyRepository()
    a, b = await _flats(repo, "Кв. 12", "Кв. 15")
    with pytest.raises(ValueError):
        await OrderPropertiesService(repo).execute(COMPANY, [a.id, b.id, a.id])


async def test_another_companys_flat_is_not_found_and_nothing_moves():
    repo = FakePropertyRepository()
    (mine,) = await _flats(repo, "Кв. 12")
    (theirs,) = await _flats(repo, "Чужая", company=uuid.uuid4())
    with pytest.raises(LookupError):
        await OrderPropertiesService(repo).execute(COMPANY, [theirs.id, mine.id])
    assert (await repo.get_by_id(mine.id)).position is None
    assert (await repo.get_by_id(theirs.id)).position is None


async def test_the_order_writes_positions_only_and_leaves_the_cards_alone():
    # A card changed or archived meanwhile must keep its change: no card is written back.
    repo = _OrderingRepo()
    a, b = await _flats(repo, "Кв. 12", "Кв. 15")
    await OrderPropertiesService(repo).execute(COMPANY, [b.id, a.id])
    assert repo.cards_written == 0
    assert [(await repo.get_by_id(f.id)).position for f in (a, b)] == [1, 0]


async def _positions(*ids: uuid.UUID) -> list[int | None]:
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with async_sessionmaker(engine)() as session:
            rows = dict((await session.execute(select(PropertyModel.id, PropertyModel.position))).all())
            return [rows[i] for i in ids]
    finally:
        await engine.dispose()


@pytest.mark.integration
async def test_the_order_is_saved_in_the_database_and_another_companys_flat_is_not_found(flat):  # noqa: F811
    client, first, use = flat
    company = await _company_of(first)
    second = _flat(company, "second")
    await _seed(second)
    use(Permission.PROPERTIES_WRITE)

    res = await client.put("/api/v1/properties/order", json={"property_ids": [str(second.id), str(first)]})
    assert res.status_code == 204, res.text
    assert await _positions(second.id, first) == [0, 1]

    # Another company's flat: nothing moves.
    res = await client.put("/api/v1/properties/order", json={"property_ids": [str(uuid.uuid4())]})
    assert res.status_code == 404, res.text
    assert await _positions(second.id, first) == [0, 1]

    res = await client.put("/api/v1/properties/order", json={"property_ids": []})
    assert res.status_code == 204, res.text
    assert await _positions(second.id, first) == [None, None]
