"""The Telegram webhook itself, driven with the payloads Telegram actually sends.

Everything else about the bot is covered by unit tests over its pieces. This is
the only place the route is exercised end to end — the ordering of link check,
transcription, reply and recording lives here and nowhere else, and two changes
to it went in without anything ever calling it.

Marked integration: it needs a database. CI deselects these, so run them before
touching this route:

    env $(grep -v '^#' local.env | grep -v '^$' | xargs) uv run pytest -m integration tests/test_telegram_webhook.py
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.domain.messaging.value_objects import Channel, MessageDirection
from app.infrastructure.database import get_session
from app.infrastructure.models.auth import CompanyModel
from app.infrastructure.models.messaging import (
    ChannelIdentityModel,
    ConversationModel,
    MessageModel,
)
from app.main import app
from app.presentation.api.v1 import webhooks

pytestmark = pytest.mark.integration

SECRET = "webhook-test-secret"


class SpyProvider:
    """Stands in for Telegram: remembers what would have been sent."""

    def __init__(self, transcript: str = "") -> None:
        self.sent: list[tuple[str, str]] = []
        self.downloads: list[str] = []
        self._transcript = transcript

    async def send_text(self, to: str, text: str):
        self.sent.append((to, text))
        return type("Sent", (), {"provider_message_id": "1"})()

    async def download_file(self, file_id: str, max_bytes: int) -> bytes:
        self.downloads.append(file_id)
        return b"fake-ogg"


@pytest.fixture
async def db():
    """A session factory bound to this test's own event loop.

    The app's engine is pooled at module level, and pytest-asyncio hands every
    test a fresh loop — reusing it across tests raises "attached to a different
    loop" from asyncpg. Overriding the dependency keeps the route on the same
    engine the assertions read from.
    """
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def _session():
        async with maker() as session:
            yield session

    app.dependency_overrides[get_session] = _session
    try:
        yield maker
    finally:
        app.dependency_overrides.pop(get_session, None)
        await engine.dispose()


@pytest.fixture
def wired(monkeypatch):
    def _wire(transcript: str = "") -> SpyProvider:
        provider = SpyProvider(transcript)
        monkeypatch.setattr(webhooks.settings, "TELEGRAM_WEBHOOK_SECRET", SECRET)
        monkeypatch.setattr(webhooks, "get_provider", lambda channel: provider)
        return provider

    return _wire


async def _post(update: dict, secret: str = SECRET):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(
            "/api/v1/webhooks/telegram",
            json=update,
            headers={"X-Telegram-Bot-Api-Secret-Token": secret},
        )


def _update(chat_id: str, message_id: int, **fields) -> dict:
    return {
        "message": {
            "message_id": message_id,
            "chat": {"id": int(chat_id), "first_name": "Оператор"},
            **fields,
        }
    }


async def _linked_chat(maker, chat_id: str) -> uuid.UUID:
    """A company with this chat bound to it, as the link-code flow would leave it."""
    async with maker() as session:
        company = CompanyModel(id=uuid.uuid4(), name=f"Webhook Test {uuid.uuid4().hex[:6]}")
        session.add(company)
        session.add(
            ChannelIdentityModel(
                id=uuid.uuid4(),
                company_id=company.id,
                channel=Channel.TELEGRAM.value,
                external_id=chat_id,
                display_name="Оператор",
                is_active=True,
            )
        )
        await session.commit()
        return company.id


async def _bodies(maker, chat_id: str) -> list[tuple[MessageDirection, str]]:
    async with maker() as session:
        identity = await session.scalar(
            select(ChannelIdentityModel).where(ChannelIdentityModel.external_id == chat_id)
        )
        if identity is None:
            return []
        conversation = await session.scalar(
            select(ConversationModel).where(ConversationModel.identity_id == identity.id)
        )
        if conversation is None:
            return []
        rows = await session.scalars(
            select(MessageModel)
            .where(MessageModel.conversation_id == conversation.id)
            .order_by(MessageModel.created_at)
        )
        return [(MessageDirection(m.direction), m.body) for m in rows.all()]


class TestAuthentication:
    @pytest.mark.asyncio
    async def test_a_wrong_secret_is_refused(self, db, wired):
        wired()
        response = await _post(_update("1", 1, text="/help"), secret="not-the-secret")
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_a_missing_secret_is_refused(self, db, wired):
        wired()
        response = await _post(_update("1", 2, text="/help"), secret="")
        assert response.status_code == 403


class TestOrdinaryMessages:
    @pytest.mark.asyncio
    async def test_a_command_is_answered_and_both_sides_are_recorded(self, db, wired):
        chat_id = str(uuid.uuid4().int % 10**9)
        await _linked_chat(db, chat_id)
        provider = wired()

        response = await _post(_update(chat_id, 10, text="/help"))

        assert response.status_code == 200
        assert provider.sent and "Команды" in provider.sent[0][1]

        recorded = await _bodies(db, chat_id)
        assert [direction for direction, _ in recorded] == [
            MessageDirection.INBOUND,
            MessageDirection.OUTBOUND,
        ], "the bot's own answer was not written down, so a follow-up has no thread"

    @pytest.mark.asyncio
    async def test_a_redelivered_update_is_ignored(self, db, wired):
        chat_id = str(uuid.uuid4().int % 10**9)
        await _linked_chat(db, chat_id)
        provider = wired()

        await _post(_update(chat_id, 20, text="/help"))
        await _post(_update(chat_id, 20, text="/help"))

        assert len(provider.sent) == 1, "Telegram's retry answered twice"

    @pytest.mark.asyncio
    async def test_a_sticker_is_ignored_quietly(self, db, wired):
        provider = wired()

        response = await _post(_update("777", 30, sticker={"file_id": "x"}))

        assert response.status_code == 200
        assert provider.sent == []


class TestVoiceNotes:
    @pytest.mark.asyncio
    async def test_an_unlinked_chat_is_turned_away_before_any_model_is_called(self, db, wired):
        provider = wired(transcript="что свободно завтра")

        response = await _post(
            _update("999000111", 40, voice={"file_id": "abc", "duration": 5, "mime_type": "audio/ogg"})
        )

        assert response.status_code == 200
        assert provider.downloads == [], "a stranger's voice note was downloaded"
        assert provider.sent and "не привязан" in provider.sent[0][1]

    @pytest.mark.asyncio
    async def test_an_over_long_recording_is_refused_without_downloading(self, db, wired):
        chat_id = str(uuid.uuid4().int % 10**9)
        await _linked_chat(db, chat_id)
        provider = wired()

        await _post(
            _update(chat_id, 50, voice={"file_id": "abc", "duration": 10_000, "mime_type": "audio/ogg"})
        )

        assert provider.downloads == []
        assert provider.sent and "Не разобрал" in provider.sent[0][1]
