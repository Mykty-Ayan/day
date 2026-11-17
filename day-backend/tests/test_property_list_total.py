"""The flat list's total and pages follow every filter, not only the tag.

The pager reads total and pages: a total that ignores status or search shows
empty pages after the last flat that matched.
"""

import pytest

from app.domain.auth.permissions import Permission
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_property_tag_filter import _company_of, _flat, _seed


@pytest.mark.integration
async def test_the_total_follows_status_and_search(flat):  # noqa: F811  (the imported fixture)
    client, active, use = flat
    company_id = await _company_of(active)
    paused = _flat(company_id, "paused")
    paused.status = "paused"
    seaside = _flat(company_id, "seaside")
    await _seed(paused, seaside)
    use(Permission.PROPERTIES_READ)

    by_status = (await client.get("/api/v1/properties", params={"status": "paused"})).json()
    assert [p["id"] for p in by_status["items"]] == [str(paused.id)]
    assert (by_status["total"], by_status["pages"]) == (1, 1)

    by_search = (await client.get("/api/v1/properties", params={"search": "seaside"})).json()
    assert [p["id"] for p in by_search["items"]] == [str(seaside.id)]
    assert by_search["total"] == 1

    nothing = (await client.get("/api/v1/properties", params={"search": "no-such-flat"})).json()
    assert (nothing["items"], nothing["total"]) == ([], 0)


@pytest.mark.integration
async def test_the_list_keeps_the_chessboard_order(flat):  # noqa: F811  (the imported fixture)
    """The owner orders the flats once, on the chessboard; the list shows them the same way:
    the placed ones by their place, then the rest by name."""
    client, first, use = flat
    company_id = await _company_of(first)
    placed, later, earlier = (_flat(company_id, name) for name in ("placed", "later", "earlier"))
    placed.internal_name, later.internal_name, earlier.internal_name = "Кв. 9", "Кв. 2", "Кв. 1"
    placed.position = 0
    # Added in this order, so the newest-first order the list had would read the other way round.
    await _seed(placed, later, earlier)
    use(Permission.PROPERTIES_READ)

    ids = [p["id"] for p in (await client.get("/api/v1/properties")).json()["items"]]
    assert ids[0] == str(placed.id)
    assert ids.index(str(earlier.id)) < ids.index(str(later.id))


@pytest.mark.integration
async def test_the_search_finds_a_flat_by_its_name_for_guests_too(flat):  # noqa: F811  (the imported fixture)
    client, active, use = flat
    company_id = await _company_of(active)
    seaside = _flat(company_id, "Студия у моря")
    seaside.internal_name = "Кв. 77"
    await _seed(seaside)
    use(Permission.PROPERTIES_READ)

    found = (await client.get("/api/v1/properties", params={"search": "у моря"})).json()
    assert [p["id"] for p in found["items"]] == [str(seaside.id)]
    assert found["total"] == 1
