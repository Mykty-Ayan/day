"""The company's rules for guests, and what each flat's card still lacks.

The CRM's AI answers guests about every flat; the rules that hold in all of them
(documents, pets, smoking, quiet hours) are written once, for the company. The
readiness report tells which fields of a flat are filled, never their values.
"""

import uuid
from datetime import datetime

import pytest

from app.application.property.manage_company_facts import MAX_COMPANY_FACTS, ManageCompanyFactsService
from app.domain.auth.permissions import Permission
from app.domain.property.value_objects import FactAudience
from tests.test_property_facts import flat  # noqa: F401  (a fixture)

COMPANY = uuid.uuid4()


class FakeCompanyFacts:
    def __init__(self):
        self.rows = {}

    async def list_by_company(self, company_id):
        return [f for f in self.rows.values() if f.company_id == company_id]

    async def find_by_text(self, company_id, text):
        return next((f for f in self.rows.values() if f.company_id == company_id and f.text == text), None)

    async def get(self, company_id, fact_id):
        found = self.rows.get(fact_id)
        return found if found is not None and found.company_id == company_id else None

    async def create(self, fact):
        self.rows[fact.id] = fact
        return fact

    async def delete(self, company_id, fact_id):
        if await self.get(company_id, fact_id) is not None:
            del self.rows[fact_id]


async def test_a_rule_is_kept_once_trimmed_and_within_the_bound():
    svc = ManageCompanyFactsService(FakeCompanyFacts())
    first, created = await svc.add(COMPANY, "  Без животных ")
    again, created_again = await svc.add(COMPANY, "Без животных")

    assert (first.text, first.audience, created) == ("Без животных", FactAudience.PUBLIC, True)
    assert (again.id, created_again) == (first.id, False)
    with pytest.raises(ValueError, match="text"):
        await svc.add(COMPANY, "   ")
    for n in range(MAX_COMPANY_FACTS - 1):
        await svc.add(COMPANY, f"Правило {n}")
    with pytest.raises(ValueError, match="at most"):
        await svc.add(COMPANY, "Ещё одно")


async def test_another_companys_rule_cannot_be_deleted():
    facts = FakeCompanyFacts()
    svc = ManageCompanyFactsService(facts)
    theirs, _ = await svc.add(uuid.uuid4(), "Не курить")

    with pytest.raises(LookupError):
        await svc.delete(COMPANY, theirs.id)
    assert theirs.id in facts.rows


@pytest.mark.integration
async def test_the_rules_are_kept_and_shown_on_every_flats_card(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.PROPERTIES_READ, Permission.PROPERTY_FACTS_WRITE, Permission.PROPERTY_SECRETS_READ)

    pets = await client.post("/api/v1/company-facts", json={"text": "Без животных"})
    assert pets.status_code == 201, pets.text
    assert (await client.post("/api/v1/company-facts", json={"text": "Без животных"})).status_code == 200
    code = await client.post("/api/v1/company-facts", json={"text": "Код сейфа 1234", "audience": "guest"})
    assert code.status_code == 201
    assert pets.json()["source"] == "api_key"

    card = (await client.get(f"/api/v1/properties/{prop}")).json()
    assert [f["text"] for f in card["company_facts"]] == ["Без животных", "Код сейфа 1234"]

    # Without the secrets scope a rule for staying guests stays hidden, on the list and on the card.
    use(Permission.PROPERTIES_READ)
    assert [f["text"] for f in (await client.get("/api/v1/company-facts")).json()] == ["Без животных"]
    card = (await client.get(f"/api/v1/properties/{prop}")).json()
    assert [f["text"] for f in card["company_facts"]] == ["Без животных"]
    assert (await client.post("/api/v1/company-facts", json={"text": "x"})).status_code == 403

    use(Permission.PROPERTIES_READ, Permission.PROPERTY_FACTS_WRITE)
    assert (await client.delete(f"/api/v1/company-facts/{pets.json()['id']}")).status_code == 204
    assert (await client.delete(f"/api/v1/company-facts/{uuid.uuid4()}")).status_code == 404
    assert (await client.get("/api/v1/company-facts")).json() == []


@pytest.mark.integration
async def test_another_companys_rules_are_neither_seen_nor_deleted(flat):  # noqa: F811  (the imported fixture)
    from app.infrastructure.models.auth import CompanyModel
    from app.infrastructure.models.property import CompanyFactModel
    from tests.test_property_tag_filter import _seed

    client, prop, use = flat
    theirs, their_fact = uuid.uuid4(), uuid.uuid4()
    await _seed(
        CompanyModel(id=theirs, name=f"Rules other {theirs.hex[:6]}"),
        CompanyFactModel(id=their_fact, company_id=theirs, text="Чужое правило", audience="public",
                         source="user", created_at=datetime.utcnow()),
    )
    use(Permission.PROPERTIES_READ, Permission.PROPERTY_FACTS_WRITE, Permission.PROPERTY_SECRETS_READ)

    assert (await client.get("/api/v1/company-facts")).json() == []
    assert (await client.get(f"/api/v1/properties/{prop}")).json()["company_facts"] == []
    assert (await client.delete(f"/api/v1/company-facts/{their_fact}")).status_code == 404


@pytest.mark.integration
async def test_the_readiness_report_tells_filled_and_empty_never_the_values(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE, Permission.PROPERTY_FACTS_WRITE)

    first = (await client.get("/api/v1/properties/readiness")).json()
    assert first["company_facts"] is False
    [item] = first["items"]
    assert item["property_id"] == str(prop)
    assert item["fields"]["pricing"] is True  # the fixture's flat has prices
    assert {"address", "wifi", "photos", "facts", "check_in_instructions"} <= set(item["empty"])

    patched = await client.patch(f"/api/v1/properties/{prop}",
                                 json={"address_full": "Астана, Туран 28", "wifi_name": "Munar"})
    assert patched.status_code == 200, patched.text
    await client.post(f"/api/v1/properties/{prop}/facts", json={"text": "Парковка во дворе", "audience": "public"})
    await client.post("/api/v1/company-facts", json={"text": "Без вечеринок"})

    report = (await client.get("/api/v1/properties/readiness")).json()
    [item] = report["items"]
    assert report["company_facts"] is True
    assert (item["fields"]["address"], item["fields"]["wifi"], item["fields"]["facts"]) == (True, True, True)
    assert "Munar" not in str(report) and "Туран" not in str(report)
