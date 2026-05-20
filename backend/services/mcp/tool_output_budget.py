"""Truncation/summarization for MCP tool output before persistence.

The Assistant tool loop persists every tool result to the conversation
and then feeds it back to the model. Without a hard cap, a large diff,
file body, or procedure definition can blow up prompt size and storage.

`budget_tool_output` walks JSON-shaped results, trims oversized strings,
caps array length, and records what was dropped. Structure is preserved
so the model can still locate ids, titles, urls, statuses, and paths.
"""

from __future__ import annotations

from typing import Any

MAX_TOOL_OUTPUT_CHARS = 18_000
MAX_ROWS = 50
MAX_ITEMS = 50
MAX_STRING_FIELD_CHARS = 2_000
_BUDGET_POLICY = "assistant_tool_output_v1"

# Fields that tend to dominate size; trim aggressively when present.
_HEAVY_FIELDS = {
    "definition",
    "body",
    "diff",
    "patch",
    "file",
    "content",
    "description",
    "comments",
    "text",
    "raw",
}


def _truncate_str(value: str, cap: int) -> tuple[str, bool]:
    if len(value) <= cap:
        return value, False
    return value[:cap] + f"\n…[truncated {len(value) - cap} chars]", True


def _walk(value: Any, *, key_hint: str = "") -> tuple[Any, bool]:
    """Return (trimmed_value, truncated_flag)."""
    truncated = False
    if isinstance(value, str):
        cap = MAX_STRING_FIELD_CHARS
        if key_hint.lower() in _HEAVY_FIELDS:
            cap = min(cap, 1_000)
        v, t = _truncate_str(value, cap)
        return v, t or truncated

    if isinstance(value, list):
        cap = MAX_ROWS if key_hint.lower() in {"rows", "results"} else MAX_ITEMS
        out: list[Any] = []
        if len(value) > cap:
            truncated = True
            value = value[:cap]
        for item in value:
            v, t = _walk(item, key_hint=key_hint)
            out.append(v)
            truncated = truncated or t
        return out, truncated

    if isinstance(value, dict):
        out_d: dict[str, Any] = {}
        for k, v in value.items():
            nv, t = _walk(v, key_hint=str(k))
            out_d[k] = nv
            truncated = truncated or t
        return out_d, truncated

    return value, truncated


def _estimate_chars(value: Any) -> int:
    try:
        import json

        return len(json.dumps(value, default=str))
    except Exception:
        return len(str(value))


def budget_tool_output(output: Any) -> tuple[Any, dict]:
    """Apply Assistant tool-output budget.

    Returns (trimmed_output, meta). Meta carries truncation info for the
    persisted message; never includes raw payload fragments.
    """
    original_size = _estimate_chars(output)
    trimmed, did_trim = _walk(output)

    # Hard cap: if still too large, json-stringify and truncate.
    final_size = _estimate_chars(trimmed)
    if final_size > MAX_TOOL_OUTPUT_CHARS:
        import json

        text = json.dumps(trimmed, default=str)[:MAX_TOOL_OUTPUT_CHARS]
        trimmed = {
            "summary_text": text + "\n…[truncated to fit budget]",
            "truncated": True,
        }
        did_trim = True
        final_size = len(text)

    meta = {
        "truncated": bool(did_trim),
        "original_size_chars": int(original_size),
        "final_size_chars": int(final_size),
        "policy": _BUDGET_POLICY,
    }
    return trimmed, meta
