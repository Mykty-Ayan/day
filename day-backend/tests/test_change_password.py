"""A user changes their own password; other sessions end, this one carries on."""

import pytest
from starlette.requests import Request

from app.application.auth.auth_service import AuthService
from app.domain.auth.entities import User
from app.domain.auth.value_objects import UserRole
from app.infrastructure.rate_limiter import _limit_for
from app.infrastructure.security import decode_token, hash_password, verify_password
from tests.test_auth_permissions import COMPANY_ID, FakeUserRepository


def _service(user: User) -> tuple[AuthService, FakeUserRepository]:
    repo = FakeUserRepository([user])
    return AuthService(repo, None), repo


def _user() -> User:
    return User(
        company_id=COMPANY_ID, email="o@c.com", role=UserRole.OWNER, hashed_password=hash_password("old-pass-1")
    )


@pytest.mark.asyncio
async def test_the_new_password_works_and_other_sessions_end():
    user = _user()
    svc, repo = _service(user)

    tokens = await svc.change_password(user.id, "old-pass-1", "new-pass-22")

    stored = repo.users[user.id]
    assert verify_password("new-pass-22", stored.hashed_password)
    assert stored.token_version == 1
    # The device that changed it gets tokens of the new version and stays in.
    assert decode_token(tokens["access_token"])["tv"] == 1
    assert decode_token(tokens["refresh_token"])["tv"] == 1


@pytest.mark.asyncio
async def test_a_wrong_current_password_changes_nothing():
    user = _user()
    svc, repo = _service(user)
    with pytest.raises(ValueError, match="Current password"):
        await svc.change_password(user.id, "guess", "new-pass-22")
    assert verify_password("old-pass-1", repo.users[user.id].hashed_password)
    assert repo.users[user.id].token_version == 0


@pytest.mark.asyncio
async def test_a_short_new_password_is_refused():
    user = _user()
    svc, _ = _service(user)
    with pytest.raises(ValueError, match="at least"):
        await svc.change_password(user.id, "old-pass-1", "short")


def test_guessing_the_current_password_gets_the_tight_limit():
    request = Request({"type": "http", "method": "POST", "path": "/api/v1/auth/change-password", "headers": []})
    assert _limit_for(request)[0] == "auth"
