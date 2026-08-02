from __future__ import annotations

import abc
import uuid

from app.domain.auth.entities import ApiKey, Company, User
from app.domain.auth.value_objects import UserRole


class UserRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_id(self, user_id: uuid.UUID) -> User | None: ...

    @abc.abstractmethod
    async def get_by_email(self, email: str) -> User | None: ...

    @abc.abstractmethod
    async def save(self, user: User) -> User: ...

    @abc.abstractmethod
    async def update(self, user: User) -> User: ...

    @abc.abstractmethod
    async def list_by_company(
        self,
        company_id: uuid.UUID,
        *,
        role: UserRole | None = None,
        include_inactive: bool = True,
    ) -> list[User]: ...

    @abc.abstractmethod
    async def get_many(self, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, User]:
        """Resolve several users at once — used to label cleaner ids."""


class ApiKeyRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_hash(self, hashed_key: str) -> ApiKey | None: ...

    @abc.abstractmethod
    async def get_by_id(self, key_id: uuid.UUID) -> ApiKey | None: ...

    @abc.abstractmethod
    async def list_by_company(self, company_id: uuid.UUID) -> list[ApiKey]: ...

    @abc.abstractmethod
    async def save(self, api_key: ApiKey) -> ApiKey: ...

    @abc.abstractmethod
    async def update(self, api_key: ApiKey) -> ApiKey: ...

    @abc.abstractmethod
    async def touch(self, key_id: uuid.UUID) -> None:
        """Record that the key was just used, without blocking the request."""


class CompanyRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_id(self, company_id: uuid.UUID) -> Company | None: ...

    @abc.abstractmethod
    async def save(self, company: Company) -> Company: ...
