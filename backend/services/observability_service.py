"""Structured observability helpers (Phase 4).

Thin wrapper over structlog that gives the rest of the codebase a small
vocabulary of named events for routing/provider/budget/assistant
activity. Every event carries a request correlation id so a single
/live/generate or /conversations/.../stream call can be reconstructed
end-to-end from logs.

Never logs secrets or full tokens. Callers must pass *names* and
*sizes*, never raw payload bodies.
"""

from __future__ import annotations

import contextvars
import time
import uuid
from contextlib import contextmanager
from typing import Iterator, Optional

import structlog


_logger = structlog.get_logger("testdeck.observability")

# Correlation ID propagated through async code via ContextVar.
_request_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "testdeck_request_id", default=None
)


def new_request_id(prefix: str = "req") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def current_request_id() -> Optional[str]:
    return _request_id_var.get()


@contextmanager
def request_scope(prefix: str = "req") -> Iterator[str]:
    """Bind a correlation id for the duration of the with-block."""
    rid = new_request_id(prefix)
    token = _request_id_var.set(rid)
    try:
        yield rid
    finally:
        _request_id_var.reset(token)


def _emit(event: str, **fields) -> None:
    rid = current_request_id()
    if rid is not None:
        fields.setdefault("request_id", rid)
    _logger.info(event, **fields)


def context_route_selected(
    *,
    ticket_key: str,
    project_key: str,
    providers_included: list[str],
    reasons: dict[str, list[str]],
    platform: str,
    include_full_files: bool,
) -> None:
    _emit(
        "context_route_selected",
        ticket_key=ticket_key,
        project_key=project_key,
        providers_included=list(providers_included),
        reasons=reasons,
        platform=platform,
        include_full_files=include_full_files,
    )


def provider_call_started(*, provider: str, ticket_key: str) -> None:
    _emit("provider_call_started", provider=provider, ticket_key=ticket_key)


def provider_call_completed(
    *,
    provider: str,
    ticket_key: str,
    duration_ms: int,
    ok: bool,
    error_code: Optional[str] = None,
) -> None:
    _emit(
        "provider_call_completed",
        provider=provider,
        ticket_key=ticket_key,
        duration_ms=duration_ms,
        ok=ok,
        error_code=error_code,
    )


def bundle_budget_applied(
    *,
    ticket_key: str,
    input_chars: int,
    hard_cap_chars: int,
    per_section_chars: dict[str, int],
    truncated_sections: list[str],
) -> None:
    _emit(
        "bundle_budget_applied",
        ticket_key=ticket_key,
        input_chars=input_chars,
        hard_cap_chars=hard_cap_chars,
        per_section_chars=dict(per_section_chars),
        truncated_sections=list(truncated_sections),
    )


def generation_completed(
    *,
    ticket_key: str,
    test_case_count: int,
    duration_ms: int,
    routed: bool,
) -> None:
    _emit(
        "generation_completed",
        ticket_key=ticket_key,
        test_case_count=test_case_count,
        duration_ms=duration_ms,
        routed=routed,
    )


def assistant_tool_invoked(
    *,
    conversation_id: str,
    connection_id: str,
    tool: str,
    duration_ms: int,
    ok: bool,
    error_code: Optional[str] = None,
) -> None:
    _emit(
        "assistant_tool_invoked",
        conversation_id=conversation_id,
        connection_id=connection_id,
        tool=tool,
        duration_ms=duration_ms,
        ok=ok,
        error_code=error_code,
    )


class Timer:
    """Tiny convenience timer — returns elapsed ms when stopped."""

    __slots__ = ("_start",)

    def __init__(self) -> None:
        self._start = time.monotonic()

    def ms(self) -> int:
        return int((time.monotonic() - self._start) * 1000)
