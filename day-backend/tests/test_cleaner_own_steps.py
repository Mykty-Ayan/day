"""A cleaner takes only their own steps: start the cleaning, then finish it.

Checking the work ("verified") is the manager's. A cleaner's token used to move
their own task through any step of the state machine, so a cleaner could mark
their own cleaning as checked, or hand it back to "assigned".
"""

import uuid
from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.domain.auth.value_objects import UserRole
from tests.test_api_permissions import _request, _user_principal


@pytest.mark.asyncio
@pytest.mark.parametrize("target", ["verified", "assigned", "pending"])
async def test_a_cleaner_cannot_take_a_step_that_is_not_theirs(target):
    status = await _request(
        "POST",
        f"/api/v1/cleaning/{uuid.uuid4()}/status",
        _user_principal(UserRole.CLEANER),
        json={"target_status": target},
    )
    assert status == 403


# ---------- HTTP against PostgreSQL ----------


@pytest.fixture
async def cleaning():
    """A company with a flat, a cleaner and a task assigned to them; a client per role."""
    from app.domain.auth.permissions import permissions_for_role
    from app.infrastructure.database import get_session
    from app.infrastructure.models.auth import CompanyModel, UserModel
    from app.infrastructure.models.cleaning import CleaningTaskModel
    from app.infrastructure.models.property import PricingConfigModel, PropertyModel
    from app.main import app
    from app.presentation.api.deps import Principal, get_principal

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    company_id, prop_id, cleaner_id, manager_id, task_id = (uuid.uuid4() for _ in range(5))
    async with maker() as session:
        session.add(CompanyModel(id=company_id, name=f"Cleaning test {company_id.hex[:6]}"))
        await session.flush()
        for user_id, role in ((cleaner_id, "cleaner"), (manager_id, "manager")):
            session.add(UserModel(id=user_id, email=f"{user_id.hex[:10]}@example.com", hashed_password="x",
                                  company_id=company_id, role=role))
        session.add(PropertyModel(id=prop_id, company_id=company_id, name="Т13", internal_name="t13",
                                  type="apartment", status="active", rental_mode="daily"))
        await session.flush()
        session.add(PricingConfigModel(property_id=prop_id, base_price=Decimal("20000")))
        session.add(CleaningTaskModel(id=task_id, company_id=company_id, property_id=prop_id, cleaner_id=cleaner_id,
                                      status="assigned", scheduled_date=date(2026, 10, 14)))
        await session.commit()

    async def _session():
        async with maker() as session:
            yield session

    def principal(user_id, role):
        return Principal(company_id=company_id, permissions=permissions_for_role(role), kind="user",
                         user_id=user_id, role=role, actor_id=user_id)

    current = {}
    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_principal] = lambda: current["principal"]

    async def step(who, target):
        current["principal"] = principal(*who)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.post(f"/api/v1/cleaning/{task_id}/status", json={"target_status": target})

    try:
        yield step, (cleaner_id, UserRole.CLEANER), (manager_id, UserRole.MANAGER)
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_principal, None)
        await engine.dispose()


@pytest.mark.integration
async def test_a_cleaner_starts_and_finishes_their_task_and_the_manager_checks_it(cleaning):
    step, cleaner, manager = cleaning

    started = await step(cleaner, "in_progress")
    done = await step(cleaner, "done")
    self_checked = await step(cleaner, "verified")
    checked = await step(manager, "verified")

    assert started.status_code == 200, started.text
    assert done.status_code == 200, done.text
    assert self_checked.status_code == 403
    assert checked.status_code == 200, checked.text
    assert checked.json()["status"] == "verified"
