"""Unit tests for LLM extractor."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.domain.value_objects import SourceType
from app.infrastructure.extractors.llm_extractor import LLMExtractor


def _make_httpx_mock_response(json_data: dict) -> MagicMock:
    """Create a mock httpx response with sync .json() and .raise_for_status()."""
    mock_response = MagicMock()
    mock_response.json.return_value = json_data
    mock_response.raise_for_status = MagicMock()
    return mock_response


def _make_httpx_mock_client(mock_response: MagicMock) -> AsyncMock:
    """Create a mock httpx AsyncClient that returns mock_response on .post()."""
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return mock_client


class TestLLMExtractorParseJson:
    def test_parse_valid_json(self):
        content = '{"name": "Test", "rooms": 2}'
        result = LLMExtractor._parse_json_response(content)
        assert result == {"name": "Test", "rooms": 2}

    def test_parse_json_with_markdown_fences(self):
        content = '```json\n{"name": "Test"}\n```'
        result = LLMExtractor._parse_json_response(content)
        assert result == {"name": "Test"}

    def test_parse_json_with_plain_fences(self):
        content = '```\n{"name": "Test"}\n```'
        result = LLMExtractor._parse_json_response(content)
        assert result == {"name": "Test"}

    def test_parse_invalid_json_returns_empty(self):
        content = "This is not JSON at all"
        result = LLMExtractor._parse_json_response(content)
        assert result == {}

    def test_parse_json_array_returns_empty(self):
        content = "[1, 2, 3]"
        result = LLMExtractor._parse_json_response(content)
        assert result == {}

    def test_parse_empty_string_returns_empty(self):
        result = LLMExtractor._parse_json_response("")
        assert result == {}

    def test_parse_json_with_whitespace(self):
        content = '  \n  {"name": "Test"}  \n  '
        result = LLMExtractor._parse_json_response(content)
        assert result == {"name": "Test"}

    def test_parse_complex_json(self):
        content = '{"name": "Villa", "amenities": ["WiFi", "Pool"], "base_price": 150.50, "rooms": null}'
        result = LLMExtractor._parse_json_response(content)
        assert result["name"] == "Villa"
        assert result["amenities"] == ["WiFi", "Pool"]
        assert result["base_price"] == 150.50
        assert result["rooms"] is None


class TestLLMExtractorNoApiKey:
    @pytest.mark.asyncio
    async def test_openai_no_key_returns_empty(self):
        """When no OpenAI API key is set, extractor should return empty dict."""
        extractor = LLMExtractor()
        with patch("app.infrastructure.extractors.llm_extractor.settings") as mock_settings:
            mock_settings.LLM_PROVIDER = "openai"
            mock_settings.OPENAI_API_KEY = ""
            result = await extractor.extract("some content", SourceType.BOOKING)
            assert result == {}

    @pytest.mark.asyncio
    async def test_anthropic_no_key_returns_empty(self):
        """When no Anthropic API key is set, extractor should return empty dict."""
        extractor = LLMExtractor()
        with patch("app.infrastructure.extractors.llm_extractor.settings") as mock_settings:
            mock_settings.LLM_PROVIDER = "anthropic"
            mock_settings.ANTHROPIC_API_KEY = ""
            result = await extractor.extract("some content", SourceType.AIRBNB)
            assert result == {}


class TestLLMExtractorHTTP:
    """Tests for LLM extractor with mocked HTTP calls."""

    @pytest.mark.asyncio
    async def test_returns_parsed_json_openai(self):
        """Mocking a successful OpenAI API call returns parsed property data."""
        openai_response = {
            "choices": [
                {
                    "message": {
                        "content": '{"name": "Beach Resort", "type": "house", "rooms": 4, "beds": 5}'
                    }
                }
            ]
        }

        mock_response = _make_httpx_mock_response(openai_response)
        mock_client = _make_httpx_mock_client(mock_response)

        extractor = LLMExtractor()
        with (
            patch("app.infrastructure.extractors.llm_extractor.httpx.AsyncClient", return_value=mock_client),
            patch("app.infrastructure.extractors.llm_extractor.settings") as mock_settings,
        ):
            mock_settings.LLM_PROVIDER = "openai"
            mock_settings.OPENAI_API_KEY = "test-key"
            mock_settings.LLM_MODEL = "gpt-4o-mini"
            mock_settings.REQUEST_TIMEOUT = 30
            mock_settings.MAX_CONTENT_LENGTH = 100000

            result = await extractor.extract("listing content", SourceType.BOOKING)

        assert result["name"] == "Beach Resort"
        assert result["type"] == "house"
        assert result["rooms"] == 4

    @pytest.mark.asyncio
    async def test_returns_parsed_json_anthropic(self):
        """Mocking a successful Anthropic API call returns parsed property data."""
        anthropic_response = {
            "content": [
                {
                    "text": '{"name": "Mountain Cabin", "type": "house", "rooms": 3}'
                }
            ]
        }

        mock_response = _make_httpx_mock_response(anthropic_response)
        mock_client = _make_httpx_mock_client(mock_response)

        extractor = LLMExtractor()
        with (
            patch("app.infrastructure.extractors.llm_extractor.httpx.AsyncClient", return_value=mock_client),
            patch("app.infrastructure.extractors.llm_extractor.settings") as mock_settings,
        ):
            mock_settings.LLM_PROVIDER = "anthropic"
            mock_settings.ANTHROPIC_API_KEY = "test-key"
            mock_settings.LLM_MODEL = "claude-3-haiku-20240307"
            mock_settings.REQUEST_TIMEOUT = 30
            mock_settings.MAX_CONTENT_LENGTH = 100000

            result = await extractor.extract("listing content", SourceType.AIRBNB)

        assert result["name"] == "Mountain Cabin"
        assert result["type"] == "house"

    @pytest.mark.asyncio
    async def test_handles_malformed_json(self):
        """When the LLM returns non-JSON, the extractor should return empty dict."""
        openai_response = {
            "choices": [
                {
                    "message": {
                        "content": "Sorry, I could not extract any property data from this listing."
                    }
                }
            ]
        }

        mock_response = _make_httpx_mock_response(openai_response)
        mock_client = _make_httpx_mock_client(mock_response)

        extractor = LLMExtractor()
        with (
            patch("app.infrastructure.extractors.llm_extractor.httpx.AsyncClient", return_value=mock_client),
            patch("app.infrastructure.extractors.llm_extractor.settings") as mock_settings,
        ):
            mock_settings.LLM_PROVIDER = "openai"
            mock_settings.OPENAI_API_KEY = "test-key"
            mock_settings.LLM_MODEL = "gpt-4o-mini"
            mock_settings.REQUEST_TIMEOUT = 30
            mock_settings.MAX_CONTENT_LENGTH = 100000

            result = await extractor.extract("some content", SourceType.BOOKING)

        assert result == {}

    @pytest.mark.asyncio
    async def test_includes_user_prompt(self):
        """User prompt should be included in the message sent to the LLM."""
        openai_response = {
            "choices": [{"message": {"content": '{"name": "Prompted Property"}'}}]
        }

        mock_response = _make_httpx_mock_response(openai_response)
        mock_client = _make_httpx_mock_client(mock_response)

        extractor = LLMExtractor()
        with (
            patch("app.infrastructure.extractors.llm_extractor.httpx.AsyncClient", return_value=mock_client),
            patch("app.infrastructure.extractors.llm_extractor.settings") as mock_settings,
        ):
            mock_settings.LLM_PROVIDER = "openai"
            mock_settings.OPENAI_API_KEY = "test-key"
            mock_settings.LLM_MODEL = "gpt-4o-mini"
            mock_settings.REQUEST_TIMEOUT = 30
            mock_settings.MAX_CONTENT_LENGTH = 100000

            result = await extractor.extract("listing content", SourceType.BOOKING, user_prompt="Focus on price")

        # Verify the post call included user_prompt in the payload
        call_kwargs = mock_client.post.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        user_message = payload["messages"][-1]["content"]
        assert "Focus on price" in user_message
        assert result["name"] == "Prompted Property"

    @pytest.mark.asyncio
    async def test_truncates_long_content(self):
        """Content should be truncated to MAX_CONTENT_LENGTH before sending to LLM."""
        openai_response = {
            "choices": [{"message": {"content": '{"name": "Truncated"}'}}]
        }

        mock_response = _make_httpx_mock_response(openai_response)
        mock_client = _make_httpx_mock_client(mock_response)

        extractor = LLMExtractor()
        # Very long content
        long_content = "A" * 500

        with (
            patch("app.infrastructure.extractors.llm_extractor.httpx.AsyncClient", return_value=mock_client),
            patch("app.infrastructure.extractors.llm_extractor.settings") as mock_settings,
        ):
            mock_settings.LLM_PROVIDER = "openai"
            mock_settings.OPENAI_API_KEY = "test-key"
            mock_settings.LLM_MODEL = "gpt-4o-mini"
            mock_settings.REQUEST_TIMEOUT = 30
            mock_settings.MAX_CONTENT_LENGTH = 100

            result = await extractor.extract(long_content, SourceType.BOOKING)

        # Verify content was truncated in the payload
        call_kwargs = mock_client.post.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        user_message = payload["messages"][-1]["content"]
        # The user_message should contain the truncated content (100 A's, not 500)
        assert user_message.count("A") <= 100
        assert result["name"] == "Truncated"

    @pytest.mark.asyncio
    async def test_handles_api_timeout(self):
        """When the LLM API times out, the exception should propagate."""
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("API request timed out"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        extractor = LLMExtractor()
        with (
            patch("app.infrastructure.extractors.llm_extractor.httpx.AsyncClient", return_value=mock_client),
            patch("app.infrastructure.extractors.llm_extractor.settings") as mock_settings,
        ):
            mock_settings.LLM_PROVIDER = "openai"
            mock_settings.OPENAI_API_KEY = "test-key"
            mock_settings.LLM_MODEL = "gpt-4o-mini"
            mock_settings.REQUEST_TIMEOUT = 30
            mock_settings.MAX_CONTENT_LENGTH = 100000

            with pytest.raises(httpx.TimeoutException):
                await extractor.extract("some content", SourceType.BOOKING)
