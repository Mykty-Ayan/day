"""A cleaner id in a request body must belong to the caller's company.

`cleaner_id` used to reach the database unchecked: an id from another company
was accepted (the task showed that user's name), an unknown id broke the foreign
key and came back as a 500. Every place that takes a cleaner in the body now
answers 404 "Cleaner not found" for both, like the rating lookups by path do —
the same reply for "does not exist" and "is not yours", so the status does not
tell a caller which ids exist in other companies.
"""

import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.domain.auth.value_objects import UserRole

pytestmark = pytest.mark.integration


@pytest.fixture
async def tenants():
    """Two companies; the caller is the manager of the first.

    `mine` is a cleaner of the caller's company, `theirs` one of the other
    company, `ghost` an id nobody has.
    """
    from app.domain.auth.permissions import permissions_for_role
    from app.infrastructure.database import get_session
    from app.infrastructure.models.auth import CompanyModel, UserModel
    from app.infrastructure.models.cleaning import CleaningTaskModel
    from app.infrastructure.models.property import PricingConfigModel, PropertyModel
    from app.main import app
    from app.presentation.api.deps import Principal, get_principal

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    mine_company, their_company = uuid.uuid4(), uuid.uuid4()
    manager, mine, theirs, ghost = (uuid.uuid4() for _ in range(4))
    prop_id, their_prop_id, their_task = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    async with maker() as session:
        for company_id in (mine_company, their_company):
            session.add(CompanyModel(id=company_id, name=f"Cleaner guard {company_id.hex[:6]}"))
        await session.flush()
        for user_id, company_id, role in (
            (manager, mine_company, "manager"),
            (mine, mine_company, "cleaner"),
            (theirs, their_company, "cleaner"),
        ):
            session.add(UserModel(id=user_id, email=f"{user_id.hex[:10]}@example.com", hashed_password="x",
                                  company_id=company_id, role=role))
        for flat_id, company_id in ((prop_id, mine_company), (their_prop_id, their_company)):
            session.add(PropertyModel(id=flat_id, company_id=company_id, name="Т13",
                                      internal_name=f"t-{flat_id.hex[:6]}", type="apartment", status="active",
                                      rental_mode="daily"))
        await session.flush()
        for flat_id in (prop_id, their_prop_id):
            session.add(PricingConfigModel(property_id=flat_id, base_price=1))
        session.add(CleaningTaskModel(id=their_task, company_id=their_company, property_id=their_prop_id,
                                      cleaner_id=theirs, status="assigned", scheduled_date=date(2026, 10, 14)))
        await session.commit()

    async def _session():
        async with maker() as session:
            yield session

    principal = Principal(company_id=mine_company, permissions=permissions_for_role(UserRole.MANAGER),
                          kind="user", user_id=manager, role=UserRole.MANAGER, actor_id=manager)
    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_principal] = lambda: principal

    async def call(method, path, json=None):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.request(method, f"/api/v1{path}", json=json)

    async def new_task(status):
        """A task of the caller's company with nobody on it."""
        task_id = uuid.uuid4()
        async with maker() as session:
            session.add(CleaningTaskModel(id=task_id, company_id=mine_company, property_id=prop_id,
                                          status=status, scheduled_date=date(2026, 10, 14)))
            await session.commit()
        return task_id

    try:
        yield SimpleNamespace(call=call, new_task=new_task, prop_id=prop_id, their_task=their_task,
                              mine=mine, theirs=theirs, ghost=ghost, maker=maker, company=mine_company)
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_principal, None)
        await engine.dispose()


def _not_found(response):
    assert response.status_code == 404, response.text
    assert response.json() == {"detail": "Cleaner not found"}


# ---------- create a task ----------


@pytest.mark.parametrize("who", ["theirs", "ghost"])
async def test_a_task_cannot_be_created_for_a_cleaner_of_another_company_or_nobody(tenants, who):
    response = await tenants.call(
        "POST", "/cleaning", {"property_id": str(tenants.prop_id), "cleaner_id": str(getattr(tenants, who))}
    )

    _not_found(response)


async def test_a_task_is_created_for_a_cleaner_of_the_callers_company(tenants):
    response = await tenants.call(
        "POST", "/cleaning", {"property_id": str(tenants.prop_id), "cleaner_id": str(tenants.mine)}
    )

    assert response.status_code == 201, response.text
    assert response.json()["cleaner_id"] == str(tenants.mine)
    assert response.json()["status"] == "assigned"


async def test_a_task_is_created_without_a_cleaner(tenants):
    response = await tenants.call("POST", "/cleaning", {"property_id": str(tenants.prop_id)})

    assert response.status_code == 201, response.text
    assert response.json()["cleaner_id"] is None
    assert response.json()["status"] == "pending"


# ---------- assign ----------


@pytest.mark.parametrize("who", ["theirs", "ghost"])
async def test_a_task_cannot_be_assigned_to_a_cleaner_of_another_company_or_nobody(tenants, who):
    task_id = await tenants.new_task("pending")

    response = await tenants.call("POST", f"/cleaning/{task_id}/assign", {"cleaner_id": str(getattr(tenants, who))})

    _not_found(response)
    task = (await tenants.call("GET", f"/cleaning/{task_id}")).json()["task"]
    assert task["cleaner_id"] is None
    assert task["status"] == "pending"


async def test_a_task_is_assigned_to_a_cleaner_of_the_callers_company(tenants):
    task_id = await tenants.new_task("pending")

    response = await tenants.call("POST", f"/cleaning/{task_id}/assign", {"cleaner_id": str(tenants.mine)})

    assert response.status_code == 200, response.text
    assert response.json()["cleaner_id"] == str(tenants.mine)
    assert response.json()["status"] == "assigned"


async def test_the_cleaner_is_told_in_telegram_when_a_cleaning_is_given_to_them(tenants):
    from sqlalchemy import select

    from app.infrastructure.models.messaging import ChannelIdentityModel, OutboundNotificationModel

    chat = str(uuid.uuid4().int)[:12]
    async with tenants.maker() as session:
        session.add(ChannelIdentityModel(company_id=tenants.company, channel="telegram", external_id=chat,
                                          user_id=tenants.mine))
        await session.commit()

    created = await tenants.call("POST", "/cleaning", {"property_id": str(tenants.prop_id),
                                                       "cleaner_id": str(tenants.mine), "scheduled_date": "2026-10-31"})
    assert created.status_code == 201, created.text
    assert (await tenants.call("POST", "/cleaning", {"property_id": str(tenants.prop_id)})).status_code == 201
    task_id = await tenants.new_task("pending")
    assigned = await tenants.call("POST", f"/cleaning/{task_id}/assign", {"cleaner_id": str(tenants.mine)})
    assert assigned.status_code == 200, assigned.text

    async with tenants.maker() as session:
        queued = (await session.scalars(
            select(OutboundNotificationModel).where(OutboundNotificationModel.company_id == tenants.company)
        )).all()
    assert [(n.event, n.target, n.payload["user_id"]) for n in queued] == [
        ("cleaning_assigned", chat, str(tenants.mine))
    ] * 2
    assert {n.payload["task_id"] for n in queued} == {created.json()["id"], str(task_id)}
    assert {n.payload["date"] for n in queued} == {"31.10.2026", "14.10.2026"}


# ---------- report (a manager files it on a cleaner's behalf) ----------


@pytest.mark.parametrize("who", ["theirs", "ghost"])
async def test_a_report_cannot_be_filed_under_a_cleaner_of_another_company_or_nobody(tenants, who):
    task_id = await tenants.new_task("in_progress")

    response = await tenants.call("POST", f"/cleaning/{task_id}/report", {"cleaner_id": str(getattr(tenants, who))})

    _not_found(response)
    task = (await tenants.call("GET", f"/cleaning/{task_id}")).json()
    assert task["report"] is None
    assert task["task"]["status"] == "in_progress"


async def test_a_report_is_filed_under_a_cleaner_of_the_callers_company(tenants):
    task_id = await tenants.new_task("in_progress")

    response = await tenants.call("POST", f"/cleaning/{task_id}/report", {"cleaner_id": str(tenants.mine)})

    assert response.status_code == 201, response.text
    assert response.json()["cleaner_id"] == str(tenants.mine)


# ---------- rating ----------


@pytest.mark.parametrize("who", ["theirs", "ghost"])
async def test_a_cleaner_of_another_company_or_nobody_cannot_be_rated(tenants, who):
    response = await tenants.call("POST", "/cleaner-ratings", {"cleaner_id": str(getattr(tenants, who)), "score": 5})

    _not_found(response)


async def test_a_cleaner_of_the_callers_company_is_rated(tenants):
    response = await tenants.call("POST", "/cleaner-ratings", {"cleaner_id": str(tenants.mine), "score": 5})

    assert response.status_code == 201, response.text
    assert response.json()["cleaner_id"] == str(tenants.mine)


# ---------- the list filter ----------


async def test_filtering_the_list_by_a_cleaner_of_another_company_shows_none_of_their_tasks(tenants):
    """The filter is not a write, so it does not 404 — but it must not reach across companies."""
    response = await tenants.call("GET", f"/cleaning?cleaner_id={tenants.theirs}")

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 0
    assert response.json()["items"] == []
