"""Another company's flat or booking, or one that does not exist, is 404, not 400.

These routes caught every ValueError as 400, the "not found" of the service
included; the deposit action also answered "Booking does not belong to company",
which told a caller the id exists elsewhere. No request here reaches the database.
"""

import uuid
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.domain.auth.permissions import permissions_for_role
from app.domain.auth.value_objects import UserRole
from app.domain.booking.value_objects import DepositStatus
from app.main import app
from app.presentation.api.deps import Principal, get_principal

COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")


class _Obj:
    def __init__(self, **kw):
        self.__dict__.update(kw)


class _Repo:
    """One canned row for get_by_id, whatever the id; no photos."""

    def __init__(self, row=None):
        self._row = row

    async def get_by_id(self, _id):
        return self._row

    async def list_by_property(self, _id):
        return []


class _Session:
    async def commit(self):
        pass

    async def rollback(self):
        pass


@pytest.fixture
def call(monkeypatch):
    from app.infrastructure.database import get_session
    from app.presentation.api.v1 import bookings, properties

    def install(**repos):
        monkeypatch.setattr(properties, "_repos", lambda session: repos)
        monkeypatch.setattr(bookings, "_repos", lambda session: repos)

    principal = Principal(company_id=COMPANY_ID, permissions=permissions_for_role(UserRole.MANAGER),
                          kind="user", user_id=USER_ID, role=UserRole.MANAGER, actor_id=USER_ID)
    app.dependency_overrides[get_session] = lambda: _Session()
    app.dependency_overrides[get_principal] = lambda: principal

    async def request(repos, method, path, json=None):
        install(**repos)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.request(method, f"/api/v1{path}", json=json)

    yield request
    app.dependency_overrides.pop(get_session, None)
    app.dependency_overrides.pop(get_principal, None)


FLAT = uuid.uuid4()
PROPERTY_WRITES = [
    ("POST", f"/properties/{FLAT}/status", {"target_status": "active"}),
    ("POST", f"/properties/{FLAT}/photos", {"url": "https://example.com/a.jpg"}),
    ("DELETE", f"/properties/{FLAT}/photos/{uuid.uuid4()}", None),
    ("PUT", f"/properties/{FLAT}/photos/reorder", {"photo_ids": []}),
    ("POST", f"/properties/{FLAT}/amenities", {"amenity_ids": []}),
    ("POST", f"/properties/{FLAT}/tags", {"tag_id": str(uuid.uuid4())}),
    ("DELETE", f"/properties/{FLAT}/tags/{uuid.uuid4()}", None),
]


@pytest.mark.parametrize("owner", ["another company", "nobody"])
@pytest.mark.parametrize("method,path,body", PROPERTY_WRITES)
async def test_a_write_to_a_flat_of_another_company_or_none_is_404(call, owner, method, path, body):
    flat = _Obj(company_id=uuid.uuid4()) if owner == "another company" else None
    repos = {"property": _Repo(flat), "photo": _Repo(), "amenity": _Repo(), "audit": _Repo()}

    response = await call(repos, method, path, body)

    assert (response.status_code, response.json()) == (404, {"detail": "Property not found"})


async def test_deleting_a_photo_of_another_flat_is_404(call):
    repos = {"property": _Repo(_Obj(company_id=COMPANY_ID)), "photo": _Repo()}

    response = await call(repos, "DELETE", f"/properties/{FLAT}/photos/{uuid.uuid4()}")

    assert (response.status_code, response.json()) == (404, {"detail": "Photo not found"})


# ---------- the deposit action ----------


BOOKING = uuid.uuid4()
DEPOSIT = uuid.uuid4()
ACTION = f"/bookings/{BOOKING}/deposits/{DEPOSIT}/action"


def _deposit(booking_id=BOOKING):
    return _Obj(id=DEPOSIT, booking_id=booking_id, amount=Decimal("5000"), status=DepositStatus.PAID)


@pytest.mark.parametrize(
    "booking,deposit",
    [
        (_Obj(company_id=uuid.uuid4()), _deposit()),  # another company's booking
        (None, _deposit()),  # no such booking
        (_Obj(company_id=COMPANY_ID), None),  # no such deposit
        (_Obj(company_id=COMPANY_ID), _deposit(uuid.uuid4())),  # a deposit of another booking
    ],
)
async def test_a_deposit_action_on_what_is_not_the_callers_is_404_alike(call, booking, deposit):
    response = await call({"booking": _Repo(booking), "deposit": _Repo(deposit)}, "POST", ACTION, {"action": "return"})

    assert (response.status_code, response.json()) == (404, {"detail": "Not found"})


async def test_a_deposit_action_the_deposit_cannot_take_is_still_400(call):
    repos = {"booking": _Repo(_Obj(company_id=COMPANY_ID)), "deposit": _Repo(_deposit())}

    response = await call(repos, "POST", ACTION, {"action": "partial_hold", "held_amount": "9000"})

    assert response.status_code == 400
    assert "cannot exceed" in response.json()["detail"]
