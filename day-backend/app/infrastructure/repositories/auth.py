from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.auth.entities import ApiKey, Company, User
from app.domain.auth.repositories import ApiKeyRepository, CompanyRepository, UserRepository
from app.domain.auth.value_objects import UserRole
from app.infrastructure.models.auth import ApiKeyModel, CompanyModel, UserModel


def _model_to_user(m: UserModel) -> User:
    return User(
        id=m.id,
        email=m.email,
        hashed_password=m.hashed_password,
        company_id=m.company_id,
        role=UserRole(m.role),
        full_name=m.full_name or "",
        phone=m.phone,
        is_active=m.is_active,
        created_at=m.created_at,
    )


def _model_to_api_key(m: ApiKeyModel) -> ApiKey:
    return ApiKey(
        id=m.id,
        company_id=m.company_id,
        name=m.name,
        hashed_key=m.hashed_key,
        key_hint=m.key_hint,
        scopes=list(m.scopes or []),
        created_by=m.created_by,
        created_at=m.created_at,
        last_used_at=m.last_used_at,
        revoked_at=m.revoked_at,
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
            full_name=user.full_name,
            phone=user.phone,
            is_active=user.is_active,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_user(model)

    async def update(self, user: User) -> User:
        model = await self._session.get(UserModel, user.id)
        if model is None:
            raise ValueError("User not found")
        model.email = user.email
        model.hashed_password = user.hashed_password
        model.role = user.role.value
        model.full_name = user.full_name
        model.phone = user.phone
        model.is_active = user.is_active
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_user(model)

    async def list_by_company(
        self,
        company_id: uuid.UUID,
        *,
        role: UserRole | None = None,
        include_inactive: bool = True,
    ) -> list[User]:
        stmt = select(UserModel).where(UserModel.company_id == company_id)
        if role is not None:
            stmt = stmt.where(UserModel.role == role.value)
        if not include_inactive:
            stmt = stmt.where(UserModel.is_active.is_(True))
        stmt = stmt.order_by(UserModel.created_at)
        rows = (await self._session.scalars(stmt)).all()
        return [_model_to_user(m) for m in rows]

    async def get_many(self, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, User]:
        if not user_ids:
            return {}
        stmt = select(UserModel).where(UserModel.id.in_(set(user_ids)))
        rows = (await self._session.scalars(stmt)).all()
        return {m.id: _model_to_user(m) for m in rows}


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


class SqlApiKeyRepository(ApiKeyRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_hash(self, hashed_key: str) -> ApiKey | None:
        stmt = select(ApiKeyModel).where(ApiKeyModel.hashed_key == hashed_key)
        result = await self._session.scalar(stmt)
        return _model_to_api_key(result) if result else None

    async def get_by_id(self, key_id: uuid.UUID) -> ApiKey | None:
        result = await self._session.get(ApiKeyModel, key_id)
        return _model_to_api_key(result) if result else None

    async def list_by_company(self, company_id: uuid.UUID) -> list[ApiKey]:
        stmt = (
            select(ApiKeyModel)
            .where(ApiKeyModel.company_id == company_id)
            .order_by(ApiKeyModel.created_at.desc())
        )
        rows = (await self._session.scalars(stmt)).all()
        return [_model_to_api_key(m) for m in rows]

    async def save(self, api_key: ApiKey) -> ApiKey:
        model = ApiKeyModel(
            id=api_key.id,
            company_id=api_key.company_id,
            name=api_key.name,
            hashed_key=api_key.hashed_key,
            key_hint=api_key.key_hint,
            scopes=list(api_key.scopes),
            created_by=api_key.created_by,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_api_key(model)

    async def update(self, api_key: ApiKey) -> ApiKey:
        model = await self._session.get(ApiKeyModel, api_key.id)
        if model is None:
            raise ValueError("API key not found")
        model.name = api_key.name
        model.scopes = list(api_key.scopes)
        model.revoked_at = api_key.revoked_at
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_api_key(model)

    async def touch(self, key_id: uuid.UUID) -> None:
        # A bare UPDATE rather than a load-modify-save: this runs on every
        # authenticated bot request and must not pull the row into the session.
        await self._session.execute(
            update(ApiKeyModel).where(ApiKeyModel.id == key_id).values(last_used_at=datetime.utcnow())
        )
