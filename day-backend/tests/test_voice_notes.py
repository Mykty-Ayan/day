"""Voice notes: the limits, and what happens when the model or Telegram says no.

The expensive mistake here is not a wrong transcript — it is transcribing
something we should not have: a stranger's audio, or a forwarded hour of
podcast. Those are what these tests pin down.
"""

from __future__ import annotations

import pytest

from app.domain.assistant.value_objects import AssistantUnavailable
from app.infrastructure.assistant.openrouter import _MIME_TO_FORMAT
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
