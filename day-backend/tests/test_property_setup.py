"""The flats list reads every flat's prices and failing calendars in one call.

The list marks a flat with no prices or with a calendar that does not read; one call
for all flats replaces two calls per flat.
"""

import uuid

import pytest

from app.domain.auth.permissions import Permission
from app.infrastructure.models.auth import CompanyModel
from app.infrastructure.models.booking import CalendarFeedModel
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_property_tag_filter import _company_of, _flat, _seed


@pytest.mark.integration
async def test_each_flat_comes_with_its_prices_and_a_failing_calendar(flat):  # noqa: F811  (the imported fixture)
    client, priced, use = flat  # the fixture's flat has a price of 20 000 a night
    company_id = await _company_of(priced)
    bare, archived = _flat(company_id, "bare"), _flat(company_id, "archived")
    archived.status = "archived"
    their_company = uuid.uuid4()
    theirs = _flat(their_company, "theirs")
    await _seed(
        bare,
        archived,
        CalendarFeedModel(company_id=company_id, property_id=bare.id, name="Airbnb", url="https://a.test/1.ics",
                          last_error="404"),
        CalendarFeedModel(company_id=company_id, property_id=priced, name="Booking", url="https://b.test/2.ics"),
        CompanyModel(id=their_company, name=f"Setup other {their_company.hex[:6]}"),
        theirs,
    )
    # Reading the flats is enough: the answer carries no calendar's address.
    use(Permission.PROPERTIES_READ)

    answer = await client.get("/api/v1/properties/setup")

    assert answer.status_code == 200
    setup = {item["property_id"]: item for item in answer.json()}
    # The archive is not on the list, and another company's flat never is.
    assert set(setup) == {str(priced), str(bare.id)}
    assert float(setup[str(priced)]["pricing"]["base_price"]) == 20000
    assert setup[str(priced)]["calendar_error"] is False
    assert setup[str(bare.id)] == {"property_id": str(bare.id), "pricing": None, "calendar_error": True}
