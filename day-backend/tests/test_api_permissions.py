"""Endpoint-level permission wiring.

Every case here asserts a *refusal*, so no request reaches the database: the
permission dependency answers before the handler runs. That is exactly the
regression worth pinning — before this, `require_role` existed but no router
used it, and a cleaner's token opened every endpoint in the product.
"""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.domain.auth.permissions import Permission, permissions_for_role
from app.domain.auth.value_objects import UserRole
from app.main import app
from app.presentation.api.deps import Principal, get_principal

COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")


def _user_principal(role: UserRole) -> Principal:
    return Principal(
        company_id=COMPANY_ID,
        permissions=permissions_for_role(role),
        kind="user",
        user_id=USER_ID,
        role=role,
        actor_id=USER_ID,
    )


def _api_key_principal(*scopes: str) -> Principal:
    return Principal(
        company_id=COMPANY_ID,
        permissions=frozenset(scopes),
        kind="api_key",
        api_key_id=uuid.uuid4(),
        actor_id=USER_ID,
    )


async def _request(method: str, path: str, principal: Principal | None, **kwargs) -> int:
    if principal is not None:
        app.dependency_overrides[get_principal] = lambda: principal
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.request(method, path, **kwargs)
        return response.status_code
    finally:
        app.dependency_overrides.pop(get_principal, None)


# ---------- what a cleaner must not reach ----------


CLEANER_FORBIDDEN = [
    ("GET", "/api/v1/analytics/metrics"),
    ("GET", "/api/v1/bookings"),
    ("POST", "/api/v1/properties"),
    ("PATCH", f"/api/v1/properties/{uuid.uuid4()}"),
    ("GET", "/api/v1/users"),
    ("GET", "/api/v1/api-keys"),
    ("POST", "/api/v1/cleaning"),
    ("PATCH", "/api/v1/settings"),
    # What the flat costs its owner is the subletter's own margin. A cleaner
    # holding a token must not be able to read the rent, let alone rewrite it.
    ("GET", f"/api/v1/properties/{uuid.uuid4()}/costs"),
    ("PUT", f"/api/v1/properties/{uuid.uuid4()}/costs"),
    # Leads carry a colleague's guest and their budget; the blacklist carries
    # someone's phone number and what was said about them in a private group.
    ("GET", "/api/v1/leads"),
    ("GET", "/api/v1/blacklist"),
    ("GET", "/api/v1/blacklist/check?phone=%2B77786823184"),
    ("POST", "/api/v1/blacklist"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", CLEANER_FORBIDDEN)
async def test_cleaner_is_refused(method, path):
    status = await _request(method, path, _user_principal(UserRole.CLEANER), json={})
    assert status == 403


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/api/v1/users"),
        ("POST", "/api/v1/users"),
        ("GET", "/api/v1/api-keys"),
        ("PATCH", "/api/v1/settings"),
    ],
)
async def test_manager_cannot_administer_the_company(method, path):
    status = await _request(method, path, _user_principal(UserRole.MANAGER), json={})
    assert status == 403


# ---------- service keys ----------


@pytest.mark.asyncio
async def test_api_key_is_limited_to_its_scopes():
    principal = _api_key_principal(Permission.BOOKINGS_READ)

    assert await _request("POST", "/api/v1/properties", principal, json={}) == 403
    assert await _request("GET", "/api/v1/analytics/metrics", principal) == 403


@pytest.mark.asyncio
async def test_api_key_cannot_administer_users_even_with_every_business_scope():
    principal = _api_key_principal(
        Permission.BOOKINGS_READ,
        Permission.BOOKINGS_WRITE,
        Permission.PROPERTIES_READ,
        Permission.PROPERTIES_WRITE,
    )
    assert await _request("GET", "/api/v1/users", principal) == 403
    assert await _request("GET", "/api/v1/api-keys", principal) == 403


# ---------- pricing rules: a read scope must not change prices ----------

_PID = uuid.uuid4()
PRICING_RULE_WRITES = [
    ("POST", f"/api/v1/properties/{_PID}/pricing/seasonal"),
    ("POST", f"/api/v1/properties/{_PID}/pricing/discounts"),
]
PRICING_RULE_READS = [
    ("GET", f"/api/v1/properties/{_PID}/pricing/seasonal"),
    ("GET", f"/api/v1/properties/{_PID}/pricing/discounts"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", PRICING_RULE_WRITES)
async def test_read_only_key_cannot_add_pricing_rules(method, path):
    principal = _api_key_principal(Permission.PROPERTIES_READ)
    assert await _request(method, path, principal, json={}) == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", PRICING_RULE_READS)
async def test_key_without_properties_scope_cannot_read_pricing_rules(method, path):
    principal = _api_key_principal(Permission.BOOKINGS_READ)
    assert await _request(method, path, principal) == 403


@pytest.mark.asyncio
async def test_read_only_key_cannot_act_on_a_deposit():
    principal = _api_key_principal(Permission.BOOKINGS_READ)
    path = f"/api/v1/bookings/{uuid.uuid4()}/deposits/{uuid.uuid4()}/action"
    assert await _request("POST", path, principal, json={}) == 403


# ---------- another company's data ----------


class _Obj:
    def __init__(self, **kw):
        self.__dict__.update(kw)


class _Repo:
    """Returns one canned row for get_by_id, whatever the id."""

    def __init__(self, row):
        self._row = row
        self.deleted = []

    async def get_by_id(self, _id):
        return self._row

    async def delete(self, _id):
        self.deleted.append(_id)


class _Session:
    async def commit(self):
        pass

    async def rollback(self):
        pass


@pytest.fixture
def fake_repos(monkeypatch):
    from app.presentation.api import deps
    from app.presentation.api.v1 import bookings

    def install(**repos):
        monkeypatch.setattr(bookings, "_repos", lambda session: repos)
        app.dependency_overrides[deps.get_session] = lambda: _Session()

    yield install
    app.dependency_overrides.pop(deps.get_session, None)


@pytest.mark.asyncio
async def test_calculate_price_hides_a_property_of_another_company(fake_repos):
    other = _Obj(company_id=uuid.uuid4())
    fake_repos(property=_Repo(other))
    body = {
        "property_id": str(uuid.uuid4()),
        "check_in": "2026-11-01",
        "check_out": "2026-11-03",
        "adults_count": 1,
        "children_count": 0,
    }
    principal = _user_principal(UserRole.MANAGER)
    assert await _request("POST", "/api/v1/bookings/calculate-price", principal, json=body) == 404


@pytest.mark.asyncio
async def test_delete_file_refuses_a_file_of_another_booking(fake_repos):
    booking_id = uuid.uuid4()
    files = _Repo(_Obj(booking_id=uuid.uuid4()))
    fake_repos(booking=_Repo(_Obj(company_id=COMPANY_ID)), file=files)
    path = f"/api/v1/bookings/{booking_id}/files/{uuid.uuid4()}"

    assert await _request("DELETE", path, _user_principal(UserRole.MANAGER)) == 404
    assert files.deleted == []


# ---------- unauthenticated ----------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/api/v1/properties"),
        ("GET", "/api/v1/bookings"),
        ("GET", "/api/v1/cleaning"),
        ("GET", "/api/v1/analytics/metrics"),
        ("GET", "/api/v1/users"),
        ("GET", "/api/v1/api-keys"),
    ],
)
async def test_anonymous_requests_are_rejected(method, path):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.request(method, path)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_no_company_can_write_the_shared_amenity_catalogue():
    # The catalogue is one list for every company; it comes with the product.
    status = await _request("POST", "/api/v1/amenities", _user_principal(UserRole.OWNER), json={"name": "x"})
    assert status == 405
