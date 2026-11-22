"""A tag name the company already has is 409, told by the error's type, not its words."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.application.property.manage_tags import ManageTagsService, TagNameTakenError
from app.domain.auth.permissions import permissions_for_role
from app.domain.auth.value_objects import UserRole
from app.domain.property.entities import PropertyTag
from app.main import app
from app.presentation.api.deps import Principal, get_principal

COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")


class _Tags:
    """The company has two tags, "Центр" and "Левый берег"."""

    def __init__(self):
        self.centre = PropertyTag(id=uuid.uuid4(), company_id=COMPANY_ID, name="Центр")
        self.left_bank = PropertyTag(id=uuid.uuid4(), company_id=COMPANY_ID, name="Левый берег")
        self._all = {t.id: t for t in (self.centre, self.left_bank)}

    async def exists_name(self, company_id, name, exclude_id=None):
        return any(t.company_id == company_id and t.name == name and t.id != exclude_id for t in self._all.values())

    async def get_by_id(self, tag_id):
        return self._all.get(tag_id)

    async def save(self, tag):
        return tag

    async def update(self, tag):
        return tag


async def test_the_service_tells_a_taken_name_by_its_type():
    tags = _Tags()
    svc = ManageTagsService(tags, property_repo=None)

    with pytest.raises(TagNameTakenError):
        await svc.create_tag(COMPANY_ID, "Центр")
    with pytest.raises(TagNameTakenError):
        await svc.update_tag(tags.left_bank.id, COMPANY_ID, name="Центр")
    # Its own name is not taken.
    assert (await svc.update_tag(tags.centre.id, COMPANY_ID, name="Центр")).name == "Центр"


class _Session:
    async def commit(self):
        pass

    async def rollback(self):
        pass


@pytest.fixture
def call(monkeypatch):
    from app.infrastructure.database import get_session
    from app.presentation.api.v1 import tags as tags_api

    tags = _Tags()
    monkeypatch.setattr(tags_api, "_tag_repos", lambda session: {"tag": tags, "property": None, "pricing": None})
    principal = Principal(company_id=COMPANY_ID, permissions=permissions_for_role(UserRole.MANAGER),
                          kind="user", user_id=USER_ID, role=UserRole.MANAGER, actor_id=USER_ID)
    app.dependency_overrides[get_session] = lambda: _Session()
    app.dependency_overrides[get_principal] = lambda: principal

    async def request(method, path, json=None):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.request(method, f"/api/v1{path}", json=json)

    yield request, tags
    app.dependency_overrides.pop(get_session, None)
    app.dependency_overrides.pop(get_principal, None)


async def test_creating_a_tag_with_a_taken_name_is_409(call):
    request, _ = call
    response = await request("POST", "/tags", {"name": "Центр"})
    assert (response.status_code, response.json()) == (409, {"detail": "Tag 'Центр' already exists"})


async def test_renaming_a_tag_to_a_taken_name_is_409_and_a_missing_tag_404(call):
    request, tags = call

    taken = await request("PATCH", f"/tags/{tags.left_bank.id}", {"name": "Центр"})
    missing = await request("PATCH", f"/tags/{uuid.uuid4()}", {"name": "Центр"})

    assert (taken.status_code, taken.json()) == (409, {"detail": "Tag 'Центр' already exists"})
    assert (missing.status_code, missing.json()) == (404, {"detail": "Tag not found"})
