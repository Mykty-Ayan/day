"""Unit tests for the permission model, service API keys and team management."""

import uuid

import pytest

from app.application.auth.api_key_service import ApiKeyService
from app.application.auth.user_service import UserManagementService
from app.domain.auth.entities import ApiKey, User
from app.domain.auth.permissions import ALL_PERMISSIONS, Permission, permissions_for_role
from app.domain.auth.repositories import ApiKeyRepository, UserRepository
from app.domain.auth.value_objects import UserRole
from app.infrastructure.security import (
    API_KEY_PREFIX,
    generate_api_key,
    hash_api_key,
    verify_password,
)

COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
OTHER_COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000099")
OWNER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")


# ---------- Fake repositories ----------


class FakeUserRepository(UserRepository):
    def __init__(self, users: list[User] | None = None) -> None:
        self.users: dict[uuid.UUID, User] = {u.id: u for u in (users or [])}

    async def get_by_id(self, user_id):
        return self.users.get(user_id)

    async def get_by_email(self, email):
        return next((u for u in self.users.values() if u.email == email), None)

    async def save(self, user):
        self.users[user.id] = user
        return user

    async def update(self, user):
        if user.id not in self.users:
            raise ValueError("User not found")
        self.users[user.id] = user
        return user

    async def list_by_company(self, company_id, *, role=None, include_inactive=True):
        return [
            u
            for u in self.users.values()
            if u.company_id == company_id
            and (role is None or u.role == role)
            and (include_inactive or u.is_active)
        ]

    async def get_many(self, user_ids):
        return {uid: self.users[uid] for uid in user_ids if uid in self.users}


class FakeApiKeyRepository(ApiKeyRepository):
    def __init__(self) -> None:
        self.keys: dict[uuid.UUID, ApiKey] = {}
        self.touched: list[uuid.UUID] = []

    async def get_by_hash(self, hashed_key):
        return next((k for k in self.keys.values() if k.hashed_key == hashed_key), None)

    async def get_by_id(self, key_id):
        return self.keys.get(key_id)

    async def list_by_company(self, company_id):
        return [k for k in self.keys.values() if k.company_id == company_id]

    async def save(self, api_key):
        self.keys[api_key.id] = api_key
        return api_key

    async def update(self, api_key):
        self.keys[api_key.id] = api_key
        return api_key

    async def touch(self, key_id):
        self.touched.append(key_id)


# ---------- Role permissions ----------


class TestRolePermissions:
    def test_owner_holds_every_permission(self):
        assert permissions_for_role(UserRole.OWNER) == ALL_PERMISSIONS

    def test_manager_cannot_manage_users_or_keys(self):
        manager = permissions_for_role(UserRole.MANAGER)
        assert Permission.USERS_MANAGE not in manager
        assert Permission.API_KEYS_MANAGE not in manager
        assert Permission.SETTINGS_WRITE not in manager
        # but still runs the day-to-day business
        assert Permission.BOOKINGS_WRITE in manager
        assert Permission.ANALYTICS_READ in manager

    def test_cleaner_is_confined_to_cleaning(self):
        cleaner = permissions_for_role(UserRole.CLEANER)
        assert cleaner == {
            Permission.PROPERTIES_READ,
            Permission.CLEANING_READ,
            Permission.CLEANING_OWN,
        }
        # the whole point of the fix: a cleaner reaches neither money nor writes
        assert Permission.ANALYTICS_READ not in cleaner
        assert Permission.BOOKINGS_READ not in cleaner
        assert Permission.PROPERTIES_WRITE not in cleaner
        assert Permission.CLEANING_WRITE not in cleaner


# ---------- API keys ----------


class TestApiKeyService:
    @pytest.mark.asyncio
    async def test_issue_returns_plaintext_once_and_stores_only_a_hash(self):
        repo = FakeApiKeyRepository()
        svc = ApiKeyService(repo)

        issued = await svc.issue(COMPANY_ID, "Telegram bot", [Permission.BOOKINGS_READ], OWNER_ID)

        assert issued.plaintext_key.startswith(API_KEY_PREFIX)
        stored = repo.keys[issued.api_key.id]
        assert stored.hashed_key == hash_api_key(issued.plaintext_key)
        assert issued.plaintext_key not in stored.hashed_key
        assert stored.key_hint == issued.plaintext_key[: len(stored.key_hint)]
        assert stored.created_by == OWNER_ID

    @pytest.mark.asyncio
    async def test_unknown_scope_is_rejected(self):
        svc = ApiKeyService(FakeApiKeyRepository())
        with pytest.raises(ValueError, match="Unknown scopes"):
            await svc.issue(COMPANY_ID, "bot", ["bookings:destroy"], OWNER_ID)

    @pytest.mark.asyncio
    async def test_scopes_are_required(self):
        svc = ApiKeyService(FakeApiKeyRepository())
        with pytest.raises(ValueError):
            await svc.issue(COMPANY_ID, "bot", [], OWNER_ID)

    @pytest.mark.asyncio
    async def test_revoke_marks_key_inactive(self):
        repo = FakeApiKeyRepository()
        svc = ApiKeyService(repo)
        issued = await svc.issue(COMPANY_ID, "bot", [Permission.BOOKINGS_READ], OWNER_ID)

        revoked = await svc.revoke(issued.api_key.id, COMPANY_ID)

        assert revoked.revoked_at is not None
        assert revoked.is_active is False

    @pytest.mark.asyncio
    async def test_revoke_refuses_another_companys_key(self):
        repo = FakeApiKeyRepository()
        svc = ApiKeyService(repo)
        issued = await svc.issue(COMPANY_ID, "bot", [Permission.BOOKINGS_READ], OWNER_ID)

        with pytest.raises(ValueError, match="not found"):
            await svc.revoke(issued.api_key.id, OTHER_COMPANY_ID)

    def test_two_keys_never_collide(self):
        assert generate_api_key() != generate_api_key()


# ---------- Team management ----------


class TestUserManagementService:
    @pytest.mark.asyncio
    async def test_owner_can_create_a_cleaner(self):
        repo = FakeUserRepository()
        svc = UserManagementService(repo)

        user = await svc.create(
            COMPANY_ID,
            "  Maria@Example.com ",
            "cleaner-pass",
            UserRole.CLEANER,
            full_name="Maria",
            phone="+7700",
        )

        assert user.email == "maria@example.com"
        assert user.role == UserRole.CLEANER
        assert user.company_id == COMPANY_ID
        assert user.full_name == "Maria"
        assert verify_password("cleaner-pass", user.hashed_password)

    @pytest.mark.asyncio
    async def test_duplicate_email_is_rejected(self):
        repo = FakeUserRepository()
        svc = UserManagementService(repo)
        await svc.create(COMPANY_ID, "a@b.com", "password1", UserRole.MANAGER)

        with pytest.raises(ValueError, match="already registered"):
            await svc.create(OTHER_COMPANY_ID, "a@b.com", "password1", UserRole.MANAGER)

    @pytest.mark.asyncio
    async def test_short_password_is_rejected(self):
        svc = UserManagementService(FakeUserRepository())
        with pytest.raises(ValueError, match="at least"):
            await svc.create(COMPANY_ID, "a@b.com", "short", UserRole.CLEANER)

    @pytest.mark.asyncio
    async def test_update_cannot_reach_another_company(self):
        other = User(company_id=OTHER_COMPANY_ID, email="x@y.com", role=UserRole.CLEANER)
        svc = UserManagementService(FakeUserRepository([other]))

        with pytest.raises(ValueError, match="not found"):
            await svc.update(other.id, COMPANY_ID, full_name="Renamed")

    @pytest.mark.asyncio
    async def test_owner_cannot_deactivate_themselves(self):
        owner = User(id=OWNER_ID, company_id=COMPANY_ID, email="o@c.com", role=UserRole.OWNER)
        svc = UserManagementService(FakeUserRepository([owner]))

        with pytest.raises(ValueError, match="your own"):
            await svc.deactivate(OWNER_ID, COMPANY_ID, acting_user_id=OWNER_ID)

    @pytest.mark.asyncio
    async def test_owner_cannot_demote_themselves(self):
        owner = User(id=OWNER_ID, company_id=COMPANY_ID, email="o@c.com", role=UserRole.OWNER)
        svc = UserManagementService(FakeUserRepository([owner]))

        with pytest.raises(ValueError, match="your own"):
            await svc.update(OWNER_ID, COMPANY_ID, role=UserRole.CLEANER, acting_user_id=OWNER_ID)

    @pytest.mark.asyncio
    async def test_password_change_rehashes(self):
        user = User(company_id=COMPANY_ID, email="c@c.com", role=UserRole.CLEANER)
        svc = UserManagementService(FakeUserRepository([user]))

        updated = await svc.update(user.id, COMPANY_ID, password="brand-new-pass")

        assert verify_password("brand-new-pass", updated.hashed_password)

    @pytest.mark.asyncio
    async def test_list_filters_by_role_and_active_state(self):
        active = User(company_id=COMPANY_ID, email="a@c.com", role=UserRole.CLEANER)
        inactive = User(company_id=COMPANY_ID, email="i@c.com", role=UserRole.CLEANER, is_active=False)
        manager = User(company_id=COMPANY_ID, email="m@c.com", role=UserRole.MANAGER)
        svc = UserManagementService(FakeUserRepository([active, inactive, manager]))

        cleaners = await svc.list(COMPANY_ID, role=UserRole.CLEANER, include_inactive=False)

        assert [u.email for u in cleaners] == ["a@c.com"]
