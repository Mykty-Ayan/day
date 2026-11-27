"""Where a guest leaves the car: the owner's line, on the flat's page and the booking's."""

import pytest

from app.domain.auth.permissions import Permission
from tests.test_property_facts import flat  # noqa: F401  (a fixture)


@pytest.mark.integration
async def test_the_owner_writes_the_parking_and_the_guest_reads_it_on_the_flat_page(flat):  # noqa: F811
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}"
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)

    saved = await client.patch(path, json={"parking": "Бесплатно во дворе, въезд с Кабанбай батыра"})

    assert saved.status_code == 200, saved.text
    card = (await client.get(path)).json()
    assert card["parking"] == "Бесплатно во дворе, въезд с Кабанбай батыра"
    history = (await client.get(f"{path}/audit-log")).json()
    assert any(entry.get("field_name") == "parking" for entry in history), history
    await client.post(f"{path}/status", json={"target_status": "active"})
    page = await client.get(f"/api/v1/public/stays/{card['public_code']}")
    assert page.status_code == 200, page.text
    assert page.json()["parking"] == "Бесплатно во дворе, въезд с Кабанбай батыра"


@pytest.mark.integration
async def test_a_parking_line_has_a_limit_and_clears(flat):  # noqa: F811
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}"
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)

    assert (await client.patch(path, json={"parking": "x" * 501})).status_code == 422
    assert (await client.patch(path, json={"parking": "Платная, 500 ₸ в час"})).status_code == 200
    assert (await client.patch(path, json={"parking": None})).status_code == 200
    assert (await client.get(path)).json()["parking"] is None
