from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.auth.auth_service import AuthService
from app.application.auth.password_reset import PasswordResetService, ResetUnavailable
from app.application.auth.telegram_login import TelegramLoginService, TelegramNotLinked, TelegramSessionEnded
from app.config import settings
from app.domain.messaging.value_objects import Channel
from app.infrastructure.database import get_session
from app.infrastructure.login_throttle import LoginThrottle, get_login_throttle
from app.infrastructure.messaging.factory import get_provider
from app.infrastructure.redis_client import get_redis
from app.infrastructure.repositories.auth import SqlCompanyRepository, SqlUserRepository
from app.infrastructure.repositories.messaging import SqlChannelIdentityRepository
from app.infrastructure.telegram_init_data import InitDataError, verify_init_data
from app.presentation.api.deps import Principal, get_current_user, get_principal
from app.presentation.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LogoutRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
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
async def login(
    body: LoginRequest,
    session: AsyncSession = Depends(get_session),
    throttle: LoginThrottle = Depends(get_login_throttle),
):
    wait = throttle.attempt(body.email)
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again later.",
            headers={"Retry-After": str(wait)},
        )
    svc = _auth_service(session)
    try:
        tokens = await svc.login(body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    throttle.succeeded(body.email)
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
    except TelegramSessionEnded as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    except TelegramNotLinked as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@auth_router.post("/change-password", response_model=TokenResponse)
async def change_password(
    body: ChangePasswordRequest,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    """New tokens come back: every other session ends, this device stays signed in."""
    if principal.user_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An API key has no password")
    try:
        tokens = await _auth_service(session).change_password(
            principal.user_id, body.current_password, body.new_password
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await session.commit()
    return tokens


def _reset_service(session: AsyncSession) -> PasswordResetService:
    return PasswordResetService(
        SqlUserRepository(session),
        SqlChannelIdentityRepository(session),
        get_redis(),
        get_provider(Channel.TELEGRAM),
    )


@auth_router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
async def request_password_reset(body: PasswordResetRequest, session: AsyncSession = Depends(get_session)):
    """Send a reset code to the user's linked Telegram chat. The answer is the same either way."""
    try:
        await _reset_service(session).request(body.email)
    except ResetUnavailable:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Password reset is unavailable")
    return {"detail": "If the account has Telegram connected, a code was sent there"}


@auth_router.post("/password-reset/confirm", response_model=TokenResponse)
async def confirm_password_reset(
    body: PasswordResetConfirm,
    session: AsyncSession = Depends(get_session),
    throttle: LoginThrottle = Depends(get_login_throttle),
):
    try:
        tokens = await _reset_service(session).confirm(body.email, body.code, body.new_password)
    except ResetUnavailable:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Password reset is unavailable")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await session.commit()
    # A lock left by someone guessing the old password must not keep the
    # rightful owner out after they proved who they are.
    throttle.succeeded(body.email)
    return tokens


@auth_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: LogoutRequest, session: AsyncSession = Depends(get_session)):
    """Sign out everywhere: every access and refresh token of this user stops working.

    Identified by the refresh token, so it works after the access token has
    expired. One version per user, so this also ends the Mini App's session;
    it signs in again from a fresh open in Telegram.
    """
    await _auth_service(session).logout_by_refresh_token(body.refresh_token)
    await session.commit()


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
