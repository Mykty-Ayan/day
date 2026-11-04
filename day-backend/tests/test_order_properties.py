"""The company's flats in its own order on the chessboard, and back to the order by name."""

import uuid

import pytest

from app.application.property.order_properties import OrderPropertiesService
from app.domain.property.entities import Property
from tests.test_property_services import FakePropertyRepository

COMPANY = uuid.uuid4()


async def _flats(repo: FakePropertyRepository, *names: str, company: uuid.UUID = COMPANY) -> list[Property]:
    return [await repo.save(Property(company_id=company, name=name, internal_name=name)) for name in names]


async def test_the_flats_take_the_order_given_and_the_rest_go_by_name():
    repo = FakePropertyRepository()
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
