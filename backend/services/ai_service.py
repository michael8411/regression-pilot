import json
import re
from typing import AsyncIterator

from google import genai
from google.genai import types

try:
    from backend.config.settings import get_settings
    from backend.config.preferences import read_preferences
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from config.settings import get_settings
    from config.preferences import read_preferences

SYSTEM_INSTRUCTION = """You are a senior QA engineer specializing in regression testing for mobile 
construction management software (HCSS E360 / Fleet Mobile / Mechanic Mobile).

Your job is to analyze Jira tickets and generate structured test cases formatted for 
Zephyr Scale import. Each test case must include:

- **Test Case Name**: Clear, descriptive name prefixed with the ticket key
- **Objective**: What this test validates
- **Preconditions**: Setup required before execution (environment, data, user roles)
- **Test Steps**: Numbered step-by-step actions (be specific — include field names, 
  button labels, navigation paths)
- **Expected Results**: What should happen after each step or group of steps
- **Priority**: Critical / High / Medium / Low
- **Labels**: Regression, the ticket key, feature area

When analyzing multiple related tickets (e.g., a cluster of pay adjustment tickets), 
identify shared preconditions and avoid creating duplicate test cases. Group related 
scenarios together and create comprehensive end-to-end flows where appropriate.

Always consider:
- Happy path scenarios
- Edge cases and boundary conditions  
- Error handling and validation
- Data persistence (does it survive sync/restart?)
- Multi-user scenarios where relevant
- Mobile-specific concerns (offline mode, sync conflicts, screen rotation)
"""

TEST_CASES_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "test_cases": {
            "type": "ARRAY",
            "description": "List of regression test cases",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name": {
                        "type": "STRING",
                        "description": "Test case name prefixed with ticket key, e.g. FM-452 - Verify pay adjustment fetch",
                    },
                    "objective": {
                        "type": "STRING",
                        "description": "What this test validates",
                    },
                    "preconditions": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                        "description": "Setup required before test execution",
                    },
                    "priority": {
                        "type": "STRING",
                        "enum": ["Critical", "High", "Medium", "Low"],
                    },
                    "labels": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                        "description": "Tags: Regression, ticket key, feature area",
                    },
                    "steps": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "step_number": {"type": "INTEGER"},
                                "action": {
                                    "type": "STRING",
                                    "description": "Specific action to perform",
                                },
                                "expected_result": {
                                    "type": "STRING",
                                    "description": "What should happen after this action",
                                },
                            },
                            "required": ["step_number", "action", "expected_result"],
                        },
                    },
                },
                "required": [
                    "name",
                    "objective",
                    "preconditions",
                    "priority",
                    "labels",
                    "steps",
                ],
            },
        },
    },
    "required": ["test_cases"],
}

GROUP_TICKETS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "groups": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING"},
                    "confidence": {"type": "NUMBER"},
                    "ticket_keys": {"type": "ARRAY", "items": {"type": "STRING"}},
                },
                "required": ["name", "confidence", "ticket_keys"],
            },
        },
        "needs_review_keys": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["groups", "needs_review_keys"],
}


def _get_client() -> genai.Client:
    return genai.Client(api_key=get_settings().gemini_api_key)


async def generate_test_cases(tickets: list[dict], user_message: str = "") -> dict:
    client = _get_client()
    prefs = read_preferences()
    ticket_context = json.dumps(tickets, indent=2, default=str)

    prompt = f"""Analyze the following Jira tickets and generate comprehensive regression
test cases for Zephyr Scale.

## Tickets
{ticket_context}

## Additional Instructions
{user_message if user_message else "Generate standard regression test cases for all tickets."}"""

    response = await client.aio.models.generate_content(
        model=prefs["ai_model"],
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            max_output_tokens=16384,
            temperature=prefs["ai_temperature"],
            response_mime_type="application/json",
            response_schema=TEST_CASES_SCHEMA,
        ),
    )

    return json.loads(response.text)


async def group_tickets_semantic(tickets: list[dict]) -> dict:
    if not tickets:
        return {"groups": []}

    keys = [str(t.get("key", "")).strip() for t in tickets if t.get("key")]
    if not keys:
        return {"groups": []}

    min_groups = 3 if len(tickets) >= 8 else 2
    max_groups = 6
    target_groups = min(max_groups, max(min_groups, round(len(tickets) ** 0.5)))

    ticket_view = [
        {
            "key": str(t.get("key", "")),
            "summary": str(t.get("summary", "")),
            "labels": t.get("labels") or [],
            "components": t.get("components") or [],
            "issue_type": str(t.get("issue_type", "")),
            "description": str(t.get("description", ""))[:280],
        }
        for t in tickets
    ]

    prompt = f"""Group these Jira tickets into pragmatic regression categories.

Goals:
- Prioritize useful regression execution buckets, not overly granular taxonomy.
- Keep category count between {min_groups} and {max_groups}. Target around {target_groups}.
- Use clear category names (e.g., "Sync & Data Flow", "Work Orders", "UI / UX").
- Put uncertain tickets in needs_review_keys.
- Return confidence per group from 0.0 to 1.0.

Important constraints:
- Every key must appear exactly once in either groups[].ticket_keys or needs_review_keys.
- Avoid tiny fragmented groups unless semantically necessary.
- Prefer merging similar themes over creating many small groups.

Tickets JSON:
{json.dumps(ticket_view, indent=2)}
"""

    client = _get_client()
    prefs = read_preferences()
    try:
        response = await client.aio.models.generate_content(
            model=prefs["ai_model"],
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=(
                    "You are an expert Jira triage assistant for regression planning. "
                    "Create compact, practical groups with predictable names."
                ),
                response_mime_type="application/json",
                response_schema=GROUP_TICKETS_SCHEMA,
                temperature=0.2,
                max_output_tokens=4096,
            ),
        )
        grouped = json.loads(response.text)
        normalized = _normalize_grouping_payload(grouped, keys)
        return normalized
    except Exception:
        return _fallback_group_tickets(tickets)


async def chat_message(
    messages: list[dict],
    tickets: list[dict] | None = None,
) -> str:
    client = _get_client()
    prefs = read_preferences()

    system = SYSTEM_INSTRUCTION
    if tickets:
        ticket_summary = json.dumps(
            [
                {
                    "key": t["key"],
                    "summary": t["summary"],
                    "description": t["description"][:500],
                }
                for t in tickets
            ],
            indent=2,
        )
        system += f"\n\n## Current Ticket Context\n{ticket_summary}"

    contents = _build_contents(messages)

    response = await client.aio.models.generate_content(
        model=prefs["ai_model"],
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=4096,
            temperature=prefs["ai_temperature"],
        ),
    )

    return response.text


async def stream_chat_message(
    messages: list[dict],
    tickets: list[dict] | None = None,
) -> AsyncIterator[str]:
    client = _get_client()
    prefs = read_preferences()

    system = SYSTEM_INSTRUCTION
    if tickets:
        ticket_summary = json.dumps(
            [
                {
                    "key": t["key"],
                    "summary": t["summary"],
                    "description": t["description"][:500],
                }
                for t in tickets
            ],
            indent=2,
        )
        system += f"\n\n## Current Ticket Context\n{ticket_summary}"

    contents = _build_contents(messages)

    async for chunk in await client.aio.models.generate_content_stream(
        model=prefs["ai_model"],
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=4096,
            temperature=prefs["ai_temperature"],
        ),
    ):
        if chunk.text:
            yield chunk.text


def _build_contents(messages: list[dict]) -> list[types.Content]:
    contents = []
    for msg in messages:
        role = "model" if msg["role"] == "assistant" else "user"
        contents.append(
            types.Content(
                role=role,
                parts=[types.Part.from_text(text=msg["content"])],
            )
        )
    return contents


def _normalize_grouping_payload(payload: dict, all_keys: list[str]) -> dict:
    key_set = set(all_keys)
    assigned: set[str] = set()
    groups_out: list[dict] = []

    for g in payload.get("groups", []):
        name = str(g.get("name", "")).strip() or "General"
        confidence = float(g.get("confidence", 0.65))
        keys = [k for k in g.get("ticket_keys", []) if k in key_set and k not in assigned]
        if not keys:
            continue
        assigned.update(keys)
        groups_out.append(
            {
                "name": name[:48],
                "confidence": max(0.0, min(1.0, confidence)),
                "ticket_keys": keys,
            }
        )

    needs_review = [
        k
        for k in payload.get("needs_review_keys", [])
        if k in key_set and k not in assigned
    ]
    assigned.update(needs_review)

    for k in all_keys:
        if k not in assigned:
            needs_review.append(k)

    groups_out.sort(key=lambda g: len(g["ticket_keys"]), reverse=True)
    if len(groups_out) > 6:
        overflow = groups_out[6:]
        groups_out = groups_out[:6]
        for g in overflow:
            needs_review.extend(g["ticket_keys"])

    if needs_review:
        groups_out.append(
            {
                "name": "Needs Review",
                "confidence": 0.45,
                "ticket_keys": sorted(set(needs_review)),
            }
        )

    return {"groups": groups_out}


def _fallback_group_tickets(tickets: list[dict]) -> dict:
    buckets: dict[str, list[str]] = {
        "Sync & Data Flow": [],
        "Work Orders": [],
        "Pay Adjustments / Time Cards": [],
        "UI / UX": [],
        "API / Backend": [],
        "General": [],
    }
    for t in tickets:
        key = str(t.get("key", "")).strip()
        summary = str(t.get("summary", "")).lower()
        labels = " ".join(t.get("labels") or []).lower()
        components = " ".join(t.get("components") or []).lower()
        combined = f"{summary} {labels} {components}"
        normalized = re.sub(r"[^a-z0-9]+", "", combined)
        if (
            "pay adjust" in combined
            or "time card" in combined
            or "timecard" in normalized
            or "pa override" in combined
        ):
            buckets["Pay Adjustments / Time Cards"].append(key)
        elif "work order" in combined or "wo " in f"{combined} " or "work request" in combined:
            buckets["Work Orders"].append(key)
        elif (
            "sync" in combined
            or "setup" in combined
            or "service bus" in combined
            or "upload" in combined
            or "download" in combined
        ):
            buckets["Sync & Data Flow"].append(key)
        elif any(x in combined for x in ["modal", "button", "screen", "ui", "layout", "icon"]):
            buckets["UI / UX"].append(key)
        elif any(x in combined for x in ["api", "endpoint", "sql", "database", "server"]):
            buckets["API / Backend"].append(key)
        else:
            buckets["General"].append(key)

    groups = [
        {"name": name, "confidence": 0.62, "ticket_keys": keys}
        for name, keys in buckets.items()
        if keys
    ]
    groups.sort(key=lambda g: len(g["ticket_keys"]), reverse=True)
    return {"groups": groups}
