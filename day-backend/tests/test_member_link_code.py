"""POST /channels/telegram/link-code for a team member.

The owner hands a cleaner a code; the cleaner's chat then signs in to the Mini
App as the cleaner. A code for someone outside the company would let one
company's owner open another company's account in Telegram.
"""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.application.messaging.link_channel import LinkChannelService
from app.domain.auth.permissions import Permission
from app.infrastructure.database import get_session
from app.main import app
from app.presentation.api.deps import Principal, get_principal
from app.presentation.api.v1 import channels
from tests.test_booking_feed import _Session
from tests.test_messaging import (
    CLEANER,
    COMPANY_ID,
    OWNER,
    OWNER_ID,
    STRANGER,
    FakeIdentityRepository,
    FakeLinkCodeRepository,
    StubUsers,
)


@pytest.fixture
def codes(monkeypatch):
    repo = FakeLinkCodeRepository()
    service = LinkChannelService(repo, FakeIdentityRepository(), StubUsers([OWNER, CLEANER, STRANGER]))
    monkeypatch.setattr(channels, "build_link_service", lambda session: service)
    monkeypatch.setattr(channels.settings, "TELEGRAM_BOT_TOKEN", "t")
    app.dependency_overrides[get_session] = lambda: _Session()
    app.dependency_overrides[get_principal] = lambda: Principal(
        company_id=COMPANY_ID,
        permissions=frozenset({Permission.API_KEYS_MANAGE}),
        kind="user",
        user_id=OWNER_ID,
        actor_id=OWNER_ID,
    )
    yield repo
    app.dependency_overrides.pop(get_session, None)
    app.dependency_overrides.pop(get_principal, None)


async def _post(json=None):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.post("/api/v1/channels/telegram/link-code", json=json)


async def test_a_code_for_a_member_links_as_that_member(codes):
    response = await _post({"user_id": str(CLEANER.id)})

    assert response.status_code == 201
    assert codes.codes[response.json()["code"]].created_by == CLEANER.id


async def test_without_a_member_the_code_is_the_callers_own(codes):
    response = await _post()

    assert response.status_code == 201
    assert codes.codes[response.json()["code"]].created_by == OWNER_ID


@pytest.mark.parametrize("member_id", [STRANGER.id, uuid.uuid4()])
async def test_no_code_for_a_user_of_another_company(codes, member_id):
    response = await _post({"user_id": str(member_id)})

    assert response.status_code == 404
    assert codes.codes == {}
