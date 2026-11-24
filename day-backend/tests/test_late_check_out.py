"""A later check-out a flat sells: until which hour and for how much."""

from decimal import Decimal

import pytest

from app.application.property.create_property import check_late_check_out
from app.domain.auth.permissions import Permission
from tests.test_property_facts import flat  # noqa: F401  (a fixture)


def test_a_late_check_out_is_later_than_check_out_and_a_price_needs_its_hour():
    check_late_check_out(12, 15, Decimal("5000"))
    check_late_check_out(None, 15, None)  # the company's 12:00, and free
    check_late_check_out(None, None, None)
    with pytest.raises(ValueError, match="later than the check-out hour"):
        check_late_check_out(12, 12, Decimal("5000"))
    with pytest.raises(ValueError, match="later than the check-out hour"):
        check_late_check_out(None, 11, None)
    with pytest.raises(ValueError, match="needs its hour"):
        check_late_check_out(12, None, Decimal("5000"))


@pytest.mark.integration
async def test_the_owner_sets_the_late_check_out_and_its_price(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}"
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    saved = await client.patch(path, json={"late_check_out_hour": 15, "late_check_out_price": 5000})
    assert saved.status_code == 200, saved.text
    card = (await client.get(path)).json()
    assert (card["late_check_out_hour"], card["late_check_out_price"]) == (15, 5000.0)
    # The check-out moved past it: refused against the saved late hour.
    moved = await client.patch(path, json={"check_in_hour": 16, "check_out_hour": 15})
    assert moved.status_code == 400 and "late check-out" in moved.text
    # Sent back as typed, the same price leaves no change in the history.
    before = len((await client.get(f"{path}/audit-log")).json())
    assert (await client.patch(path, json={"late_check_out_price": "5000"})).status_code == 200
    assert len((await client.get(f"{path}/audit-log")).json()) == before
    # A price alone has nothing to sell.
    assert (await client.patch(path, json={"late_check_out_hour": None})).status_code == 400
    cleared = await client.patch(path, json={"late_check_out_hour": None, "late_check_out_price": None})
    assert cleared.status_code == 200
    assert (await client.get(path)).json()["late_check_out_hour"] is None
