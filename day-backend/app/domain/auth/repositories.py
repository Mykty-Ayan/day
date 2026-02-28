from __future__ import annotations

import abc
import uuid

from app.domain.auth.entities import Company, User


class UserRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_id(self, user_id: uuid.UUID) -> User | None: ...

    @abc.abstractmethod
    async def get_by_email(self, email: str) -> User | None: ...

    @abc.abstractmethod
    async def save(self, user: User) -> User: ...


class CompanyRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_id(self, company_id: uuid.UUID) -> Company | None: ...

    @abc.abstractmethod
    async def save(self, company: Company) -> Company: ...
