from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.auth.auth_service import AuthService, issue_tokens
from app.application.auth.password_reset import PasswordResetService, ResetUnavailable
from app.application.auth.telegram_codes import CodesUnavailable, private_chat_of
from app.application.auth.telegram_login import TelegramLoginService, TelegramNotLinked, TelegramSessionEnded
from app.application.auth.two_factor import TwoFactorService
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
    LoginResponse,
    LoginVerifyRequest,
    LogoutRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    TelegramMiniAppRequest,
    TokenResponse,
    TwoFactorRequest,
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


def _two_factor(session: AsyncSession) -> TwoFactorService:
    return TwoFactorService(
        SqlUserRepository(session),
        SqlChannelIdentityRepository(session),
        get_redis(),
        get_provider(Channel.TELEGRAM),
    )


@auth_router.post("/login", response_model=LoginResponse)
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
        user = await svc.authenticate(body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    throttle.succeeded(body.email)
    if not user.two_factor_enabled:
        return issue_tokens(user)
    try:
        challenge = await _two_factor(session).start(user)
    except CodesUnavailable:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Sign-in codes are unavailable")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return LoginResponse(two_factor_required=True, challenge=challenge)


@auth_router.post("/login/verify", response_model=TokenResponse)
async def verify_login(body: LoginVerifyRequest, session: AsyncSession = Depends(get_session)):
    """The second step: the code from Telegram for the challenge the password earned."""
    try:
        return await _two_factor(session).verify(body.challenge, body.code)
    except CodesUnavailable:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Sign-in codes are unavailable")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@auth_router.post("/two-factor", response_model=UserResponse)
async def set_two_factor(
    body: TwoFactorRequest,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    """Turn the Telegram code at sign-in on or off; both directions take the password."""
    if principal.user_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An API key has no sign-in")
    try:
        user = await _two_factor(session).set_enabled(principal.user_id, body.password, body.enabled)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await session.commit()
    return await _user_response(user, session)


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
    return await _user_response(db_user, session)


async def _user_response(user, session: AsyncSession) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        company_id=user.company_id,
        role=user.role,
        is_active=user.is_active,
        two_factor_enabled=user.two_factor_enabled,
        telegram_linked=await private_chat_of(SqlChannelIdentityRepository(session), user) is not None,
    )
