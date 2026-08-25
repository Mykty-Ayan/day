"""Telegram Mini App sign-in: signature verification and the link requirement."""

import hashlib
import hmac
import json
import time
import uuid
from urllib.parse import urlencode

import pytest

from app.application.auth.telegram_login import TelegramLoginService, TelegramNotLinked
from app.domain.auth.entities import User
from app.domain.auth.value_objects import UserRole
from app.domain.messaging.entities import ChannelIdentity
from app.domain.messaging.value_objects import Channel
from app.infrastructure.security import decode_token
from app.infrastructure.telegram_init_data import InitDataError, verify_init_data
from tests.test_auth_permissions import FakeUserRepository
from tests.test_messaging import FakeIdentityRepository

BOT_TOKEN = "123456:test-bot-token"
COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
OWNER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
TELEGRAM_ID = 777001


def _sign(fields: dict, token: str = BOT_TOKEN) -> str:
    """Build an initData string the way Telegram does."""
    data_check_string = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    signature = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode({**fields, "hash": signature})


def _init_data(user_id: int = TELEGRAM_ID, auth_date: int | None = None, token: str = BOT_TOKEN) -> str:
    return _sign(
        {
            "auth_date": str(auth_date if auth_date is not None else int(time.time())),
            "query_id": "AAH",
            "user": json.dumps({"id": user_id, "first_name": "Дос", "username": "dos"}),
        },
        token,
    )


class TestVerifyInitData:
    def test_valid_blob_returns_the_user(self):
        user = verify_init_data(_init_data(), BOT_TOKEN)
        assert user.id == TELEGRAM_ID
        assert user.display_name == "Дос"

    def test_tampered_payload_is_rejected(self):
        # Swap the user id but keep the original signature.
        raw = _init_data()
        tampered = raw.replace("777001", "999999")
        with pytest.raises(InitDataError, match="signature"):
            verify_init_data(tampered, BOT_TOKEN)

    def test_signature_from_another_bot_is_rejected(self):
        with pytest.raises(InitDataError, match="signature"):
            verify_init_data(_init_data(token="999:other-bot"), BOT_TOKEN)

    def test_unsigned_blob_is_rejected(self):
        with pytest.raises(InitDataError, match="not signed"):
            verify_init_data("user=%7B%22id%22%3A1%7D&auth_date=1", BOT_TOKEN)

    def test_stale_blob_is_rejected(self):
        old = int(time.time()) - 90000
        with pytest.raises(InitDataError, match="expired"):
            verify_init_data(_init_data(auth_date=old), BOT_TOKEN)

    def test_missing_token_is_rejected(self):
        with pytest.raises(InitDataError, match="not configured"):
            verify_init_data(_init_data(), "")

    def test_empty_init_data_is_rejected(self):
        with pytest.raises(InitDataError, match="Missing"):
            verify_init_data("", BOT_TOKEN)

    def test_blob_without_a_user_is_rejected(self):
        with pytest.raises(InitDataError, match="no usable user"):
            verify_init_data(_sign({"auth_date": str(int(time.time()))}), BOT_TOKEN)


def _linked_setup(role: UserRole = UserRole.OWNER, active_identity: bool = True):
    user = User(id=OWNER_ID, company_id=COMPANY_ID, email="o@c.com", role=role)
    identity = ChannelIdentity(
        company_id=COMPANY_ID,
        channel=Channel.TELEGRAM,
        external_id=str(TELEGRAM_ID),
        user_id=OWNER_ID,
        is_active=active_identity,
    )
    return TelegramLoginService(FakeIdentityRepository([identity]), FakeUserRepository([user]))


class TestTelegramLogin:
    @pytest.mark.asyncio
    async def test_linked_account_gets_tokens_for_its_company(self):
        svc = _linked_setup()
        telegram_user = verify_init_data(_init_data(), BOT_TOKEN)

        tokens = await svc.issue_tokens(telegram_user)

        claims = decode_token(tokens["access_token"])
        assert claims["sub"] == str(OWNER_ID)
        assert claims["company_id"] == str(COMPANY_ID)
        assert claims["role"] == "owner"

    @pytest.mark.asyncio
    async def test_unlinked_telegram_account_gets_nothing(self):
        svc = TelegramLoginService(FakeIdentityRepository(), FakeUserRepository())
        telegram_user = verify_init_data(_init_data(), BOT_TOKEN)

        with pytest.raises(TelegramNotLinked, match="not connected"):
            await svc.issue_tokens(telegram_user)

    @pytest.mark.asyncio
    async def test_disconnected_chat_gets_nothing(self):
        svc = _linked_setup(active_identity=False)
        telegram_user = verify_init_data(_init_data(), BOT_TOKEN)

        with pytest.raises(TelegramNotLinked):
            await svc.issue_tokens(telegram_user)

    @pytest.mark.asyncio
    async def test_deactivated_user_gets_nothing(self):
        user = User(id=OWNER_ID, company_id=COMPANY_ID, email="o@c.com", is_active=False)
        identity = ChannelIdentity(
            company_id=COMPANY_ID,
            channel=Channel.TELEGRAM,
            external_id=str(TELEGRAM_ID),
            user_id=OWNER_ID,
        )
        svc = TelegramLoginService(FakeIdentityRepository([identity]), FakeUserRepository([user]))

        with pytest.raises(TelegramNotLinked, match="disabled"):
            await svc.issue_tokens(verify_init_data(_init_data(), BOT_TOKEN))

    @pytest.mark.asyncio
    async def test_identity_moved_to_another_company_is_refused(self):
        # The chat was re-linked elsewhere; the token must not be issued for a
        # company the user does not belong to.
        user = User(id=OWNER_ID, company_id=COMPANY_ID, email="o@c.com")
        identity = ChannelIdentity(
            company_id=uuid.UUID("00000000-0000-0000-0000-000000000099"),
            channel=Channel.TELEGRAM,
            external_id=str(TELEGRAM_ID),
            user_id=OWNER_ID,
        )
        svc = TelegramLoginService(FakeIdentityRepository([identity]), FakeUserRepository([user]))

        with pytest.raises(TelegramNotLinked, match="stale"):
            await svc.issue_tokens(verify_init_data(_init_data(), BOT_TOKEN))

    @pytest.mark.asyncio
    async def test_manager_keeps_their_own_role(self):
        svc = _linked_setup(role=UserRole.MANAGER)
        tokens = await svc.issue_tokens(verify_init_data(_init_data(), BOT_TOKEN))

        assert decode_token(tokens["access_token"])["role"] == "manager"
