"""Voice notes and the bot's memory of the thread.

Voice notes: the limits, and what happens when the model or Telegram says no.

The expensive mistake here is not a wrong transcript — it is transcribing
something we should not have: a stranger's audio, or a forwarded hour of
podcast. Those are what these tests pin down.
"""

from __future__ import annotations

import pytest

from app.config import settings
from app.domain.assistant.value_objects import AssistantUnavailable
from app.domain.messaging.value_objects import MessageDirection
from app.infrastructure.assistant.openrouter import _MIME_TO_FORMAT, OpenRouterTranscriber
from app.infrastructure.messaging.providers import ProviderError, TelegramProvider
from app.presentation.api.v1 import webhooks


class StubProvider:
    def __init__(self, audio: bytes = b"ogg", error: Exception | None = None) -> None:
        self._audio = audio
        self._error = error
        self.requested: list[tuple[str, int]] = []

    async def download_file(self, file_id: str, max_bytes: int) -> bytes:
        self.requested.append((file_id, max_bytes))
        if self._error is not None:
            raise self._error
        return self._audio


class StubTranscriber:
    def __init__(self, text: str = "что свободно завтра", error: Exception | None = None) -> None:
        self._text = text
        self._error = error
        self.seen: list[str] = []

    async def transcribe(self, audio: bytes, mime_type: str) -> str:
        self.seen.append(mime_type)
        if self._error is not None:
            raise self._error
        return self._text


@pytest.fixture
def wired(monkeypatch):
    """Point the webhook module at stubs and hand them back."""

    def _wire(provider: StubProvider | None = None, transcriber: StubTranscriber | None = None):
        provider = provider or StubProvider()
        transcriber = transcriber or StubTranscriber()
        monkeypatch.setattr(webhooks, "get_provider", lambda channel: provider)
        monkeypatch.setattr(webhooks, "OpenRouterTranscriber", lambda: transcriber)
        return provider, transcriber

    return _wire


class TestTranscribeVoice:
    @pytest.mark.asyncio
    async def test_a_voice_note_becomes_text(self, wired):
        provider, transcriber = wired()

        said = await webhooks._transcribe_voice(
            {"file_id": "abc", "duration": 4, "mime_type": "audio/ogg"}
        )

        assert said == "что свободно завтра"
        assert provider.requested == [("abc", webhooks._MAX_VOICE_BYTES)]
        assert transcriber.seen == ["audio/ogg"]

    @pytest.mark.asyncio
    async def test_a_long_recording_is_refused_before_it_is_downloaded(self, wired):
        provider, transcriber = wired()

        said = await webhooks._transcribe_voice(
            {"file_id": "abc", "duration": webhooks._MAX_VOICE_SECONDS + 1}
        )

        assert said == ""
        assert provider.requested == [], "a podcast was downloaded before being rejected"
        assert transcriber.seen == [], "a podcast was sent to the model"

    @pytest.mark.asyncio
    async def test_an_update_without_a_file_id_is_ignored(self, wired):
        provider, _ = wired()

        assert await webhooks._transcribe_voice({"duration": 3}) == ""
        assert provider.requested == []

    @pytest.mark.asyncio
    async def test_a_download_failure_is_swallowed(self, wired):
        wired(provider=StubProvider(error=ProviderError("gone")))

        assert await webhooks._transcribe_voice({"file_id": "abc"}) == ""

    @pytest.mark.asyncio
    async def test_no_model_configured_reads_as_no_transcript(self, wired):
        wired(transcriber=StubTranscriber(error=AssistantUnavailable("off")))

        assert await webhooks._transcribe_voice({"file_id": "abc"}) == ""

    @pytest.mark.asyncio
    async def test_the_default_mime_is_telegrams_own(self, wired):
        _, transcriber = wired()

        await webhooks._transcribe_voice({"file_id": "abc"})

        assert transcriber.seen == ["audio/ogg"]


class TestMimeMapping:
    def test_telegram_voice_maps_to_a_format_the_model_accepts(self):
        # Verified against the provider: ogg/opus goes through untranscoded.
        assert _MIME_TO_FORMAT["audio/ogg"] == "ogg"
        assert _MIME_TO_FORMAT["audio/mpeg"] == "mp3"


class TestDownloadFile:
    @pytest.mark.asyncio
    async def test_an_unconfigured_bot_refuses_to_download(self):
        provider = TelegramProvider(token="")

        with pytest.raises(ProviderError, match="TELEGRAM_BOT_TOKEN"):
            await provider.download_file("abc", 1024)


class StubMessage:
    def __init__(self, direction, body: str) -> None:
        self.direction = direction
        self.body = body


class StubMessageRepo:
    """Returns messages newest-first, the way the SQL repository does."""

    def __init__(self, messages) -> None:
        self._messages = messages
        self.limits: list[int] = []

    async def list_by_conversation(self, conversation_id, *, limit: int = 50):
        self.limits.append(limit)
        return list(self._messages)[:limit]


class TestRecentTurns:
    @pytest.mark.asyncio
    async def test_the_thread_comes_back_oldest_first_with_roles(self, monkeypatch):
        stored = [
            StubMessage(MessageDirection.OUTBOUND, "Свободна 62-я."),
            StubMessage(MessageDirection.INBOUND, "что свободно завтра?"),
        ]
        monkeypatch.setattr(webhooks, "SqlMessageRepository", lambda session: StubMessageRepo(stored))

        turns = await webhooks._recent_turns(None, "conv")

        assert [(turn.role, turn.content) for turn in turns] == [
            ("user", "что свободно завтра?"),
            ("assistant", "Свободна 62-я."),
        ]

    @pytest.mark.asyncio
    async def test_empty_bodies_are_dropped(self, monkeypatch):
        stored = [
            StubMessage(MessageDirection.INBOUND, "   "),
            StubMessage(MessageDirection.INBOUND, "что свободно?"),
        ]
        monkeypatch.setattr(webhooks, "SqlMessageRepository", lambda session: StubMessageRepo(stored))

        turns = await webhooks._recent_turns(None, "conv")

        assert [turn.content for turn in turns] == ["что свободно?"]

    @pytest.mark.asyncio
    async def test_the_thread_is_bounded(self, monkeypatch):
        repo = StubMessageRepo([])
        monkeypatch.setattr(webhooks, "SqlMessageRepository", lambda session: repo)

        await webhooks._recent_turns(None, "conv")

        assert repo.limits == [webhooks._HISTORY_TURNS]


class TestTranscriptionModel:
    """Which model the audio is billed against.

    Voice used to go through whatever answers questions, which meant speech was
    billed at reasoning prices. The knob exists so the two can be moved apart;
    the default keeps the old behaviour so an unset variable changes nothing.
    """

    def test_it_falls_back_to_the_assistant_model(self, monkeypatch):
        monkeypatch.setattr(settings, "ASSISTANT_MODEL", "vendor/answers")
        monkeypatch.setattr(settings, "ASSISTANT_TRANSCRIBE_MODEL", "")

        assert OpenRouterTranscriber().model == "vendor/answers"

    def test_a_separate_model_wins(self, monkeypatch):
        monkeypatch.setattr(settings, "ASSISTANT_MODEL", "vendor/answers")
        monkeypatch.setattr(settings, "ASSISTANT_TRANSCRIBE_MODEL", "vendor/cheap-ears")

        assert OpenRouterTranscriber().model == "vendor/cheap-ears"

    def test_an_explicit_argument_beats_both(self, monkeypatch):
        monkeypatch.setattr(settings, "ASSISTANT_MODEL", "vendor/answers")
        monkeypatch.setattr(settings, "ASSISTANT_TRANSCRIBE_MODEL", "vendor/cheap-ears")

        assert OpenRouterTranscriber(model="vendor/pinned").model == "vendor/pinned"
