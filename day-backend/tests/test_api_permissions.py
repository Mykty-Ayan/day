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
