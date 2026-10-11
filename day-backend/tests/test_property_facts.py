"""What an apartment's host knows and a guest asks about: its knowledge base.

Facts are short notes per apartment ("parking in the yard is free", "the
intercom code changes on Fridays"). The CRM's AI answers guests from them, and
writes a fact once the owner approves it. A fact meant only for a guest with a
confirmed stay (a code, a password) must say so.
"""

import uuid
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.application.property.manage_facts import ManageFactsService
from app.config import settings
from app.domain.auth.permissions import Permission
from app.domain.property.entities import Property, PropertyFact
from app.domain.property.repositories import PropertyFactRepository
from app.domain.property.value_objects import FactAudience, FactSource

COMPANY_ID = uuid.uuid4()


class FakeProperties:
    def __init__(self, *props):
        self._rows = {p.id: p for p in props}

    async def get_by_id(self, property_id):
        return self._rows.get(property_id)


class FakeFacts(PropertyFactRepository):
    def __init__(self):
        self.rows: dict[uuid.UUID, PropertyFact] = {}

    async def list_by_property(self, property_id):
        return [f for f in self.rows.values() if f.property_id == property_id]

    async def find_by_text(self, property_id, text):
        return next((f for f in self.rows.values() if f.property_id == property_id and f.text == text), None)

    async def get_by_id(self, fact_id):
        return self.rows.get(fact_id)

    async def create(self, fact):
        self.rows[fact.id] = fact
        return fact

    async def delete(self, fact_id):
        self.rows.pop(fact_id, None)


def _service():
    prop = Property(company_id=COMPANY_ID, name="Т13")
    facts = FakeFacts()
    return ManageFactsService(FakeProperties(prop, OTHER_FLAT), facts), prop, facts


OTHER_FLAT = Property(company_id=COMPANY_ID, name="Т14")


async def test_a_fact_is_kept_for_guests_only_unless_said_otherwise():
    svc, prop, _ = _service()
    fact, created = await svc.add(prop.id, COMPANY_ID, "  Код домофона 1234  ")
    assert created
    assert (fact.text, fact.audience, fact.company_id) == ("Код домофона 1234", FactAudience.GUEST, COMPANY_ID)
    assert fact.source == FactSource.USER


async def test_a_fact_says_whether_a_person_or_an_integration_wrote_it():
    svc, prop, _ = _service()
    fact, _ = await svc.add(prop.id, COMPANY_ID, "Парковка во дворе", source=FactSource.API_KEY)
    assert fact.source == FactSource.API_KEY


async def test_an_apartment_holds_at_most_a_hundred_facts():
    svc, prop, _ = _service()
    for i in range(100):
        await svc.add(prop.id, COMPANY_ID, f"Факт {i}")
    with pytest.raises(ValueError, match="at most 100 facts"):
        await svc.add(prop.id, COMPANY_ID, "Факт 100")
    # Repeating a fact it already has is still fine.
    _, created = await svc.add(prop.id, COMPANY_ID, "Факт 7")
    assert not created


async def test_the_same_fact_twice_is_one_fact():
    svc, prop, facts = _service()
    first, _ = await svc.add(prop.id, COMPANY_ID, "Парковка во дворе бесплатно", FactAudience.PUBLIC)
    again, created = await svc.add(prop.id, COMPANY_ID, "Парковка во дворе бесплатно", FactAudience.PUBLIC)
    assert not created
    assert again.id == first.id
    assert len(facts.rows) == 1


async def test_an_empty_fact_is_refused():
    svc, prop, _ = _service()
    with pytest.raises(ValueError, match="A fact needs text"):
        await svc.add(prop.id, COMPANY_ID, "   ")


async def test_another_companys_apartment_has_no_facts_for_you():
    svc, prop, _ = _service()
    await svc.add(prop.id, COMPANY_ID, "Тихий двор")
    with pytest.raises(ValueError, match="Property not found"):
        await svc.list(prop.id, uuid.uuid4())
    with pytest.raises(ValueError, match="Property not found"):
        await svc.add(prop.id, uuid.uuid4(), "Чужой факт")


async def test_a_fact_is_deleted_only_through_its_apartment():
    svc, prop, facts = _service()
    fact, _ = await svc.add(prop.id, COMPANY_ID, "Лифт до 9 этажа")
    with pytest.raises(ValueError, match="Fact not found"):
        await svc.delete(OTHER_FLAT.id, COMPANY_ID, fact.id)
    await svc.delete(prop.id, COMPANY_ID, fact.id)
    assert facts.rows == {}


def test_managers_may_write_facts():
    from app.domain.auth.permissions import permissions_for_role
    from app.domain.auth.value_objects import UserRole

    assert Permission.PROPERTY_FACTS_WRITE in permissions_for_role(UserRole.MANAGER)
    assert Permission.PROPERTY_FACTS_WRITE not in permissions_for_role(UserRole.CLEANER)


# ---------- HTTP ----------


@pytest.fixture
async def flat():
    """A client for a company with one apartment; set its scopes with use(...)."""
    from app.infrastructure.database import get_session
    from app.infrastructure.models.auth import CompanyModel
    from app.infrastructure.models.property import PricingConfigModel, PropertyModel
    from app.main import app
    from app.presentation.api.deps import Principal, get_principal

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    company_id, prop_id = uuid.uuid4(), uuid.uuid4()
    async with maker() as session:
        session.add(CompanyModel(id=company_id, name=f"Facts test {company_id.hex[:6]}"))
        await session.flush()
        session.add(
            PropertyModel(
                id=prop_id, company_id=company_id, name="Т13", internal_name="t13",
                type="apartment", status="active", rental_mode="daily",
            )
        )
        await session.flush()
        session.add(PricingConfigModel(property_id=prop_id, base_price=Decimal("20000")))
        await session.commit()

    async def _session():
        async with maker() as session:
            yield session

    def use(*scopes):
        principal = Principal(
            company_id=company_id, permissions=frozenset(scopes), kind="api_key",
            api_key_id=uuid.uuid4(), actor_id=uuid.uuid4(),
        )
        app.dependency_overrides[get_principal] = lambda: principal

    app.dependency_overrides[get_session] = _session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client, prop_id, use
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_principal, None)
        await engine.dispose()


@pytest.mark.integration
async def test_the_crm_writes_a_fact_and_reads_it_with_the_card(flat):
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}/facts"

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert (await client.post(path, json={"text": "Парковка бесплатно"})).status_code == 403

    use(Permission.PROPERTIES_READ, Permission.PROPERTY_FACTS_WRITE)
    created = await client.post(path, json={"text": "Парковка во дворе бесплатно", "audience": "public"})
    again = await client.post(path, json={"text": "Парковка во дворе бесплатно", "audience": "public"})
    secret = await client.post(path, json={"text": "Код домофона 1234"})

    assert created.status_code == 201, created.text
    assert again.status_code == 200
    assert again.json()["id"] == created.json()["id"]
    assert secret.json()["audience"] == "guest"
    assert created.json()["source"] == "api_key"

    card = (await client.get(f"/api/v1/properties/{prop}")).json()
    assert [(f["text"], f["audience"]) for f in card["facts"]] == [
        ("Парковка во дворе бесплатно", "public"),
        ("Код домофона 1234", "guest"),
    ]
    assert len((await client.get(path)).json()) == 2

    assert (await client.delete(f"{path}/{secret.json()['id']}")).status_code == 204
    assert [f["text"] for f in (await client.get(path)).json()] == ["Парковка во дворе бесплатно"]


@pytest.mark.integration
async def test_facts_of_another_company_stay_hidden(flat):
    client, prop, use = flat
    use(Permission.PROPERTIES_READ, Permission.PROPERTY_FACTS_WRITE)
    await client.post(f"/api/v1/properties/{prop}/facts", json={"text": "Тихий двор"})

    from app.main import app
    from app.presentation.api.deps import Principal, get_principal

    stranger = Principal(
        company_id=uuid.uuid4(), permissions=frozenset({Permission.PROPERTIES_READ, Permission.PROPERTY_FACTS_WRITE}),
        kind="api_key", api_key_id=uuid.uuid4(), actor_id=uuid.uuid4(),
    )
    app.dependency_overrides[get_principal] = lambda: stranger
    assert (await client.get(f"/api/v1/properties/{prop}/facts")).status_code == 404
    assert (await client.post(f"/api/v1/properties/{prop}/facts", json={"text": "x"})).status_code == 404


@pytest.mark.integration
async def test_a_fact_has_limits(flat):
    client, prop, use = flat
    use(Permission.PROPERTIES_READ, Permission.PROPERTY_FACTS_WRITE)
    path = f"/api/v1/properties/{prop}/facts"
    assert (await client.post(path, json={"text": "x" * 1001})).status_code == 422
    assert (await client.post(path, json={"text": "ok", "audience": "everyone"})).status_code == 422
    assert (await client.post(path, json={"text": "   "})).status_code == 400
