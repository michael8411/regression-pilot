import pytest


def test_passthrough_when_under_budget():
    from services.mcp.tool_output_budget import budget_tool_output

    payload = {"id": 1, "title": "x", "rows": [{"a": 1}, {"a": 2}]}
    out, meta = budget_tool_output(payload)
    assert out == payload
    assert meta["truncated"] is False


def test_truncates_long_string_field():
    from services.mcp.tool_output_budget import (
        budget_tool_output,
        MAX_STRING_FIELD_CHARS,
    )

    huge = "x" * (MAX_STRING_FIELD_CHARS * 4)
    out, meta = budget_tool_output({"definition": huge})
    assert meta["truncated"] is True
    # Heavy field cap is stricter than string cap.
    assert len(out["definition"]) <= 1_200


def test_caps_array_length():
    from services.mcp.tool_output_budget import budget_tool_output, MAX_ITEMS

    items = [{"i": i} for i in range(MAX_ITEMS + 30)]
    out, meta = budget_tool_output({"data": items})
    assert meta["truncated"] is True
    assert len(out["data"]) == MAX_ITEMS


def test_hard_cap_collapses_oversized_payload():
    from services.mcp.tool_output_budget import (
        budget_tool_output,
        MAX_TOOL_OUTPUT_CHARS,
    )

    big_blob = {f"k{i}": "v" * 500 for i in range(200)}
    out, meta = budget_tool_output(big_blob)
    assert meta["truncated"] is True
    # Either trimmed via summary or remains under the hard cap.
    assert meta["final_size_chars"] <= MAX_TOOL_OUTPUT_CHARS + 100


def test_metadata_records_policy_label():
    from services.mcp.tool_output_budget import budget_tool_output

    _, meta = budget_tool_output({"x": 1})
    assert meta["policy"] == "assistant_tool_output_v1"
