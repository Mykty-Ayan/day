from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.auth.auth_service import AuthService
from app.application.auth.telegram_login import TelegramLoginService, TelegramNotLinked
from app.config import settings
from app.infrastructure.database import get_session
from app.infrastructure.repositories.auth import SqlCompanyRepository, SqlUserRepository
from app.infrastructure.repositories.messaging import SqlChannelIdentityRepository
from app.infrastructure.telegram_init_data import InitDataError, verify_init_data
from app.presentation.api.deps import get_current_user
from app.presentation.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TelegramMiniAppRequest,
    TokenResponse,
    UserResponse,
)

auth_router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_service(session: AsyncSession) -> AuthService:
    return AuthService(SqlUserRepository(session), SqlCompanyRepository(session))


@auth_router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, session: AsyncSession = Depends(get_session)):
    svc = _auth_service(session)
    try:
        tokens = await svc.register(body.email, body.password, body.company_name)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    await session.commit()
    return tokens


@auth_router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)):
    svc = _auth_service(session)
    try:
        tokens = await svc.login(body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    return tokens


@auth_router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, session: AsyncSession = Depends(get_session)):
    svc = _auth_service(session)
    try:
        tokens = await svc.refresh(body.refresh_token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    return tokens


@auth_router.post("/telegram-miniapp", response_model=TokenResponse)
async def telegram_miniapp_login(
    body: TelegramMiniAppRequest,
    session: AsyncSession = Depends(get_session),
):
    """Exchange a signed Telegram `initData` blob for ordinary API tokens.

    The Mini App then talks to the same API as the web app, with the same
    permissions as the linked user.
    """
    try:
        telegram_user = verify_init_data(body.init_data, settings.TELEGRAM_BOT_TOKEN)
    except InitDataError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    svc = TelegramLoginService(SqlChannelIdentityRepository(session), SqlUserRepository(session))
    try:
        return await svc.issue_tokens(telegram_user)
    except TelegramNotLinked as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@auth_router.get("/me", response_model=UserResponse)
async def me(user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    import uuid

    svc = _auth_service(session)
    db_user = await svc.get_current_user(uuid.UUID(user["sub"]))
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserResponse(
        id=db_user.id,
        email=db_user.email,
        company_id=db_user.company_id,
        role=db_user.role,
        is_active=db_user.is_active,
    )
