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
