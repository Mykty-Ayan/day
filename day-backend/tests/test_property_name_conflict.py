"""A flat's internal name is unique in the company: a taken one answers 409.

Renaming onto a taken name used to answer 400, and two requests racing for one
name passed the service check together, so the database refused the second and
the caller got a 500.
"""

import pytest

from app.domain.auth.permissions import Permission
from app.infrastructure.repositories.property import SqlPropertyRepository
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_property_tag_filter import _company_of, _flat, _seed

_NEW_FLAT = {"name": "Т13 копия", "internal_name": "t13", "type": "apartment"}


@pytest.fixture
def check_missed(monkeypatch):
    """What the losing request of a race sees: the service check found the name free."""

    async def _free(self, company_id, internal_name, *, exclude_id=None):
        return False

    monkeypatch.setattr(SqlPropertyRepository, "exists_internal_name", _free)


@pytest.mark.integration
async def test_renaming_onto_a_taken_name_is_a_conflict(flat):  # noqa: F811  (the imported fixture)
    client, taken, use = flat
    other = _flat(await _company_of(taken), "other")
    await _seed(other)
    use(Permission.PROPERTIES_WRITE)

    res = await client.patch(f"/api/v1/properties/{other.id}", json={"internal_name": "t13"})

    assert res.status_code == 409, res.text


@pytest.mark.integration
async def test_a_create_that_loses_the_race_for_a_name_is_a_conflict(flat, check_missed):  # noqa: F811
    client, _, use = flat
    use(Permission.PROPERTIES_WRITE)

    res = await client.post("/api/v1/properties", json=_NEW_FLAT)

    assert res.status_code == 409, res.text


@pytest.mark.integration
async def test_a_rename_that_loses_the_race_for_a_name_is_a_conflict(flat, check_missed):  # noqa: F811
    client, taken, use = flat
    other = _flat(await _company_of(taken), "other")
    await _seed(other)
    use(Permission.PROPERTIES_WRITE)

    res = await client.patch(f"/api/v1/properties/{other.id}", json={"internal_name": "t13"})

    assert res.status_code == 409, res.text


@pytest.mark.integration
async def test_a_clone_that_loses_the_race_for_a_name_is_a_conflict(flat, monkeypatch):  # noqa: F811
    client, source, use = flat

    async def _taken(self, company_id, base_name):
        return "t13"  # what a second click finds when the first clone took the next name

    monkeypatch.setattr(SqlPropertyRepository, "find_next_clone_name", _taken)
    use(Permission.PROPERTIES_WRITE)

    res = await client.post(f"/api/v1/properties/{source}/clone")

    assert res.status_code == 409, res.text
