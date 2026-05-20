"""Tests for pre-Gemini secret redaction in ai_service.py."""

from __future__ import annotations

import asyncio
from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Unit tests for the redact_prompt_for_external helper
# ---------------------------------------------------------------------------

class TestRedactPromptForExternal:

    def test_replaces_google_api_key(self):
        from services.ai_service import redact_prompt_for_external
        fake_key = "AIza" + "A" * 35
        prompt = f"Use key {fake_key} to call the API."
        redacted, warnings = redact_prompt_for_external(prompt, context="test")
        assert fake_key not in redacted
        assert "[REDACTED]" in redacted

    def test_returns_pattern_names_only(self):
        from services.ai_service import redact_prompt_for_external
        fake_key = "AIza" + "B" * 35
        _, warnings = redact_prompt_for_external(
            f"key={fake_key}", context="test"
        )
        assert warnings == ["GOOGLE_API_KEY"]
        # Ensure the list contains only pattern names, no matched values.
        for w in warnings:
            assert isinstance(w, str)
            assert "AIza" not in w

    def test_clean_prompt_returns_empty_warnings(self):
        from services.ai_service import redact_prompt_for_external
        redacted, warnings = redact_prompt_for_external(
            "A clean prompt with no secrets.", context="test"
        )
        assert redacted == "A clean prompt with no secrets."
        assert warnings == []

    def test_redact_messages_does_not_mutate_original(self):
        from services.ai_service import _redact_messages
        fake_key = "AIza" + "C" * 35
        messages = [{"role": "user", "content": f"key is {fake_key}"}]
        result, _ = _redact_messages(messages)
        # Original dict is unchanged.
        assert fake_key in messages[0]["content"]
        # Returned list has redacted content.
        assert fake_key not in result[0]["content"]


# ---------------------------------------------------------------------------
# Integration-style tests: verify Gemini is called with redacted prompt
# ---------------------------------------------------------------------------

_FAKE_KEY = "AIza" + "D" * 35


def _make_mock_response(text: str = '{"test_cases":[]}') -> MagicMock:
    resp = MagicMock()
    resp.text = text
    return resp


def _make_mock_client(response_text: str = '{"test_cases":[]}') -> MagicMock:
    client = MagicMock()
    mock_resp = _make_mock_response(response_text)
    client.aio.models.generate_content = AsyncMock(return_value=mock_resp)
    return client


class TestGenerateTestCasesRedaction:

    def test_send_redacted_prompt(self):
        from services.ai_service import generate_test_cases

        mock_client = _make_mock_client()
        tickets = [{"key": "FM-1", "summary": f"Key is {_FAKE_KEY}", "description": "x"}]
        with patch("services.ai_service._get_client", return_value=mock_client):
            result = asyncio.run(generate_test_cases(tickets))

        call_args = mock_client.aio.models.generate_content.call_args
        prompt_sent = call_args.kwargs.get("contents") or call_args.args[0]
        prompt_str = str(prompt_sent)
        assert _FAKE_KEY not in prompt_str

    def test_warnings_included_in_result(self):
        from services.ai_service import generate_test_cases

        mock_client = _make_mock_client()
        tickets = [{"key": "FM-1", "summary": f"Key is {_FAKE_KEY}", "description": "x"}]
        with patch("services.ai_service._get_client", return_value=mock_client):
            result = asyncio.run(generate_test_cases(tickets))

        assert "secret_scan_warnings" in result
        assert any(w["pattern_name"] == "GOOGLE_API_KEY" for w in result["secret_scan_warnings"])

    def test_clean_prompt_no_warnings_key(self):
        from services.ai_service import generate_test_cases

        mock_client = _make_mock_client()
        tickets = [{"key": "FM-2", "summary": "Normal ticket", "description": "nothing here"}]
        with patch("services.ai_service._get_client", return_value=mock_client):
            result = asyncio.run(generate_test_cases(tickets))

        assert "secret_scan_warnings" not in result


class TestGroupTicketsRedaction:

    def test_prompt_sent_without_secret(self):
        from services.ai_service import group_tickets_semantic

        mock_client = _make_mock_client('{"groups":[],"needs_review_keys":[]}')
        tickets = [{"key": _FAKE_KEY[:6], "summary": f"Secret {_FAKE_KEY}"}]

        with patch("services.ai_service._get_client", return_value=mock_client):
            asyncio.run(group_tickets_semantic(tickets))

        call_args = mock_client.aio.models.generate_content.call_args
        assert call_args is not None, "generate_content was not called (fell to fallback)"
        prompt_sent = str(call_args.kwargs.get("contents") or call_args.args[0])
        assert _FAKE_KEY not in prompt_sent


class TestStreamChatRedaction:

    def _make_stream_client(self, chunks: list[str]) -> MagicMock:
        async def fake_gen(*args, **kwargs):
            async def _inner():
                for c in chunks:
                    chunk = MagicMock()
                    chunk.text = c
                    yield chunk
            return _inner()

        client = MagicMock()
        client.aio.models.generate_content_stream = fake_gen
        return client

    def _collect_stream(self, gen) -> list:
        async def _inner():
            result = []
            async for item in gen:
                result.append(item)
            return result
        return asyncio.run(_inner())

    def test_warning_event_emitted_when_secret_in_system(self):
        from services.ai_service import stream_chat_message

        tickets = [{"key": "FM-1", "summary": f"{_FAKE_KEY}", "description": "x"}]
        mock_client = self._make_stream_client(["Hello"])

        with patch("services.ai_service._get_client", return_value=mock_client):
            events = self._collect_stream(
                stream_chat_message([], tickets=tickets)
            )

        warning_events = [e for e in events if isinstance(e, dict) and "secret_scan_warnings" in e]
        assert len(warning_events) == 1
        assert any(
            w["pattern_name"] == "GOOGLE_API_KEY"
            for w in warning_events[0]["secret_scan_warnings"]
        )

    def test_secret_not_in_streamed_content_to_gemini(self):
        from services.ai_service import stream_chat_message

        messages = [{"role": "user", "content": f"my key is {_FAKE_KEY}"}]
        mock_client = self._make_stream_client(["response"])

        captured_contents = []

        original_fake_gen = self._make_stream_client(["response"]).aio.models.generate_content_stream

        async def capturing_gen(*args, **kwargs):
            captured_contents.append(kwargs.get("contents") or (args[0] if args else None))
            async def _inner():
                chunk = MagicMock()
                chunk.text = "response"
                yield chunk
            return _inner()

        mock_client.aio.models.generate_content_stream = capturing_gen

        with patch("services.ai_service._get_client", return_value=mock_client):
            self._collect_stream(stream_chat_message(messages))

        assert captured_contents, "generate_content_stream was not called"
        assert _FAKE_KEY not in str(captured_contents[0])

    def test_original_messages_not_mutated(self):
        from services.ai_service import stream_chat_message

        messages = [{"role": "user", "content": f"key={_FAKE_KEY}"}]
        original_content = messages[0]["content"]
        mock_client = self._make_stream_client(["ok"])

        with patch("services.ai_service._get_client", return_value=mock_client):
            self._collect_stream(stream_chat_message(messages))

        assert messages[0]["content"] == original_content
