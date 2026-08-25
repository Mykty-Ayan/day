"""Team management and service API keys — both owner-only surfaces."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.auth.api_key_service import ApiKeyService
from app.application.auth.user_service import UserManagementService
from app.domain.auth.entities import ApiKey, User
from app.domain.auth.permissions import ALL_PERMISSIONS, Permission
from app.domain.auth.value_objects import UserRole
from app.infrastructure.database import get_session
from app.infrastructure.repositories.auth import SqlApiKeyRepository, SqlUserRepository
from app.presentation.api.deps import get_company_id, get_user_id, require
from app.presentation.schemas.auth import (
    ApiKeyCreate,
    ApiKeyCreatedResponse,
    ApiKeyResponse,
    UserCreate,
    UserResponse,
    UserUpdate,
)

user_router = APIRouter(prefix="/users", tags=["users"])
api_key_router = APIRouter(prefix="/api-keys", tags=["api-keys"])


def _to_user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        company_id=user.company_id,
        role=user.role,
        is_active=user.is_active,
        full_name=user.full_name,
        phone=user.phone,
    )


def _to_api_key_response(api_key: ApiKey) -> ApiKeyResponse:
    return ApiKeyResponse(
        id=api_key.id,
        name=api_key.name,
        key_hint=api_key.key_hint,
        scopes=api_key.scopes,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
        revoked_at=api_key.revoked_at,
        is_active=api_key.is_active,
    )


# ---------- team ----------


@user_router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require(Permission.USERS_MANAGE))],
)
async def create_user(
    body: UserCreate,
    company_id: uuid.UUID = Depends(get_company_id),
    session: AsyncSession = Depends(get_session),
):
    svc = UserManagementService(SqlUserRepository(session))
    try:
        user = await svc.create(
            company_id=company_id,
            email=body.email,
            password=body.password,
            role=body.role,
            full_name=body.full_name,
            phone=body.phone,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    await session.commit()
    return _to_user_response(user)


@user_router.get("", response_model=list[UserResponse], dependencies=[Depends(require(Permission.USERS_MANAGE))])
async def list_users(
    role: UserRole | None = None,
    include_inactive: bool = True,
    company_id: uuid.UUID = Depends(get_company_id),
    session: AsyncSession = Depends(get_session),
):
    svc = UserManagementService(SqlUserRepository(session))
    users = await svc.list(company_id, role=role, include_inactive=include_inactive)
    return [_to_user_response(u) for u in users]


@user_router.get(
    "/cleaners",
    response_model=list[UserResponse],
    dependencies=[Depends(require(Permission.CLEANING_READ))],
)
async def list_cleaners(
    company_id: uuid.UUID = Depends(get_company_id),
    session: AsyncSession = Depends(get_session),
):
    """Assignable cleaners.

    Separate from the owner-only team list because assigning a task is a
    scheduling action, not user administration — a manager needs it.
    """
    svc = UserManagementService(SqlUserRepository(session))
    users = await svc.list(company_id, role=UserRole.CLEANER, include_inactive=False)
    return [_to_user_response(u) for u in users]


@user_router.patch(
    "/{user_id}",
    response_model=UserResponse,
    dependencies=[Depends(require(Permission.USERS_MANAGE))],
)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    company_id: uuid.UUID = Depends(get_company_id),
    acting_user_id: uuid.UUID = Depends(get_user_id),
    session: AsyncSession = Depends(get_session),
):
    svc = UserManagementService(SqlUserRepository(session))
    try:
        user = await svc.update(
            user_id,
            company_id,
            full_name=body.full_name,
            phone=body.phone,
            role=body.role,
            is_active=body.is_active,
            password=body.password,
            acting_user_id=acting_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await session.commit()
    return _to_user_response(user)


@user_router.delete(
    "/{user_id}",
    response_model=UserResponse,
    dependencies=[Depends(require(Permission.USERS_MANAGE))],
)
async def deactivate_user(
    user_id: uuid.UUID,
    company_id: uuid.UUID = Depends(get_company_id),
    acting_user_id: uuid.UUID = Depends(get_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Deactivate rather than delete — cleaning history keeps pointing at the account."""
    svc = UserManagementService(SqlUserRepository(session))
    try:
        user = await svc.deactivate(user_id, company_id, acting_user_id=acting_user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await session.commit()
    return _to_user_response(user)


# ---------- service API keys ----------


@api_key_router.get(
    "/scopes",
    response_model=list[str],
    dependencies=[Depends(require(Permission.API_KEYS_MANAGE))],
)
async def list_available_scopes():
    return sorted(ALL_PERMISSIONS)


@api_key_router.post(
    "",
    response_model=ApiKeyCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require(Permission.API_KEYS_MANAGE))],
)
async def create_api_key(
    body: ApiKeyCreate,
    company_id: uuid.UUID = Depends(get_company_id),
    created_by: uuid.UUID = Depends(get_user_id),
    session: AsyncSession = Depends(get_session),
):
    svc = ApiKeyService(SqlApiKeyRepository(session))
    try:
        issued = await svc.issue(company_id, body.name, body.scopes, created_by)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await session.commit()
    return ApiKeyCreatedResponse(
        **_to_api_key_response(issued.api_key).model_dump(),
        key=issued.plaintext_key,
    )


@api_key_router.get(
    "",
    response_model=list[ApiKeyResponse],
    dependencies=[Depends(require(Permission.API_KEYS_MANAGE))],
)
async def list_api_keys(
    company_id: uuid.UUID = Depends(get_company_id),
    session: AsyncSession = Depends(get_session),
):
    svc = ApiKeyService(SqlApiKeyRepository(session))
    return [_to_api_key_response(k) for k in await svc.list(company_id)]


@api_key_router.delete(
    "/{key_id}",
    response_model=ApiKeyResponse,
    dependencies=[Depends(require(Permission.API_KEYS_MANAGE))],
)
async def revoke_api_key(
    key_id: uuid.UUID,
    company_id: uuid.UUID = Depends(get_company_id),
    session: AsyncSession = Depends(get_session),
):
    svc = ApiKeyService(SqlApiKeyRepository(session))
    try:
        api_key = await svc.revoke(key_id, company_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    await session.commit()
    return _to_api_key_response(api_key)
