from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.auth.entities import Company, User
from app.domain.auth.repositories import CompanyRepository, UserRepository
from app.domain.auth.value_objects import UserRole
from app.infrastructure.models.auth import CompanyModel, UserModel


def _model_to_user(m: UserModel) -> User:
    return User(
        id=m.id,
        email=m.email,
        hashed_password=m.hashed_password,
        company_id=m.company_id,
        role=UserRole(m.role),
        is_active=m.is_active,
        created_at=m.created_at,
    )


def _model_to_company(m: CompanyModel) -> Company:
    return Company(id=m.id, name=m.name, created_at=m.created_at)


class SqlUserRepository(UserRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self._session.get(UserModel, user_id)
        return _model_to_user(result) if result else None

    async def get_by_email(self, email: str) -> User | None:
        stmt = select(UserModel).where(UserModel.email == email)
        result = await self._session.scalar(stmt)
        return _model_to_user(result) if result else None

    async def save(self, user: User) -> User:
        model = UserModel(
            id=user.id,
            email=user.email,
            hashed_password=user.hashed_password,
            company_id=user.company_id,
            role=user.role.value,
            is_active=user.is_active,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_user(model)


class SqlCompanyRepository(CompanyRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, company_id: uuid.UUID) -> Company | None:
        result = await self._session.get(CompanyModel, company_id)
        return _model_to_company(result) if result else None

    async def save(self, company: Company) -> Company:
        model = CompanyModel(id=company.id, name=company.name)
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_company(model)
