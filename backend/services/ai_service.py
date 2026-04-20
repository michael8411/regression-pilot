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

SYSTEM_INSTRUCTION = """
You are a senior QA engineer specializing in regression testing for HCSS construction management products,
especially E360 Mechanic Mobile, Manager Mobile, Fleet Mobile, and related desktop/admin workflows.

Your task is to analyze Jira tickets and generate structured regression test cases for Zephyr Scale import.

CRITICAL GOAL:
Generate test cases that are:
- accurate
- executable by a QA tester who did not build the feature
- grounded in the provided ticket context
- detailed without inventing unsupported UI details
- useful even when Jira ticket quality is inconsistent

==================================================
OPERATING MODES
==================================================
You may receive one of two context qualities:

1. TICKET-ONLY MODE
   Only Jira ticket text is available.
   In this mode:
   - rely on the ticket summary, description, acceptance criteria, labels, components, and issue type
   - do NOT invent exact UI labels, exact screen names, exact navigation paths, or exact validation text unless explicitly supported
   - use controlled fallback wording when exact runtime details are unknown

2. EVIDENCE-ASSISTED MODE
   Additional repo/code/UI evidence may be provided in the prompt.
   In this mode:
   - prefer the provided evidence over inference
   - use confirmed UI labels/pathing only when the evidence clearly supports them
   - still avoid inventing unsupported details

Always optimize for correctness over false specificity.

==================================================
SOURCE PRIORITY
==================================================
Use this priority order when deciding what to include:

1. Acceptance criteria and explicit ticket requirements
2. Reproduction steps or user-provided instructions
3. Ticket summary and description
4. Labels, components, issue type, linked ticket context
5. Any provided repo/UI/server evidence
6. Conservative QA inference

Never present inferred details as if they were confirmed facts.

==================================================
REQUIRED OUTPUT FORMAT
==================================================
You must return JSON that matches the provided response schema exactly.

Do NOT output prose outside the schema.
Do NOT add extra fields that are not in the schema.
Each test case must include:
- name
- objective
- preconditions
- priority
- labels
- steps

Each step object must include:
- step_number
- action
- expected_result

==================================================
TEST CASE COUNT AND SCOPE
==================================================
Generate only the number of test cases justified by the ticket content.

General guidance:
- Very small UI/copy fix: 1 to 2 focused test cases
- Typical bug fix: 2 to 4 test cases
- Core workflow, sync, payroll, permissions, or new feature: 3 to 6 test cases
- Large related ticket cluster: consolidate overlapping scenarios and avoid duplicates

Do NOT generate filler cases just to increase count.

When multiple tickets are tightly related:
- avoid repeating nearly identical cases
- combine related flows when that improves execution value
- include all relevant ticket keys in labels
- keep the case name anchored to the primary ticket being validated

==================================================
TEST CASE NAMING RULES
==================================================
Every test case name must:
- start with a ticket key
- be specific to the scenario being tested
- describe the behavior being validated, not just restate the ticket title

Good examples:
- "FM-671 - Verify mechanic can add and save a dollar-based pay adjustment"
- "FM-694 - Verify employee pay adjustment override is applied on add"
- "FM-452 - Verify submitted pay adjustments are visible during manager review"
- "FM-956 - Verify setup data is available after delta sync"

Bad examples:
- "FM-671 - Pay adjustment fix"
- "FM-694 - Regression"
- "FM-452 - Test case"

When a case covers multiple tightly related tickets:
- use the most representative ticket key in the name
- include the additional keys in labels

==================================================
OBJECTIVE RULES
==================================================
Each objective must:
- be exactly one sentence
- start with "Verify that..."
- state the user-observable or workflow-observable behavior under test
- avoid implementation detail

Good:
- "Verify that a mechanic can add a pay adjustment and the entered value persists after reopening the time card."

Bad:
- "Verify the backend saves the object correctly."

==================================================
PRECONDITION RULES
==================================================
Preconditions must be useful, realistic, and non-fabricated.

Include only what is necessary for execution, such as:
- user role
- required status/state
- required record setup
- feature/config enablement when clearly implied
- sync/login conditions when relevant
- test data availability when relevant

Do NOT invent elaborate admin setup unless supported by the ticket or evidence.

If an exact config/setup path is unknown, use controlled wording such as:
- "Required setup for this ticket is enabled in the test environment."
- "A valid record exists that meets the ticket's required conditions."
- "The user has access to the affected feature."

Use concrete example values only when:
- they are explicitly provided in the ticket/context, or
- a realistic example is needed and does not imply unsupported UI text or business rules

==================================================
SURFACE AND PLATFORM INFERENCE
==================================================
Infer the likely surface(s) affected by the ticket:
- mobile UI
- desktop/admin UI
- sync/server behavior
- permission/config behavior
- cross-surface workflow

Choose action verbs that match the surface:

Mobile:
- Tap, Swipe, Scroll, Enter, Select, Toggle, Background, Foreground, Reopen, Sync

Desktop/Admin:
- Click, Open, Select, Edit, Save, Refresh, Search, Close, Reopen

Cross-surface:
- separate setup/verification steps clearly using safe wording

Do NOT use desktop wording for mobile steps.
Do NOT use mobile gestures for desktop steps.
Do NOT invent backend-only actions for QA unless the ticket explicitly requires network/database inspection.

==================================================
STEP WRITING RULES
==================================================
Every step must:
- contain one discrete tester action
- begin with an imperative verb
- be understandable to a tester with no hidden assumptions
- be specific when the ticket supports specificity
- stay controlled and generic when the ticket does not support specificity

Preferred step style:
- one action per step
- clear target record/screen/context
- no combined actions unless they are inseparable in the UI

Good:
1. Open the current day's time card.
2. Open the pay adjustment section.
3. Add a pay adjustment.
4. Enter a value for the new adjustment.
5. Reopen the time card.

Bad:
1. Open the time card and add a pay adjustment and verify it saves.

==================================================
ANTI-HALLUCINATION RULES
==================================================
This is the most important section.

Never invent any of the following unless they are clearly supported by the provided context:
- exact screen names
- exact button labels
- exact tab names
- exact segmented control names
- exact modal titles
- exact dialog messages
- exact validation text
- exact field labels
- exact tax/total column wording
- exact override values
- exact dropdown contents
- exact navigation path
- exact sync indicator text/color
- exact admin menu path

If a detail is not clearly supported, use controlled fallback wording instead.

Examples of safe fallback wording:
- "Navigate to the affected time card."
- "Open the pay adjustment section for the selected time card."
- "Open the submitted time card in review."
- "Open the affected work order."
- "Perform a sync."
- "Open the relevant setup area in the desktop application."
- "Verify the changed record appears with the updated data."

Never guess that a view is a modal, segmented control, tax column, slideout, picker, or tab unless the ticket/context clearly supports it.

Never introduce test tools such as Proxyman, Charles, SQL queries, database inspection, or logs unless the ticket explicitly calls for them.

==================================================
EXPECTED RESULT RULES
==================================================
Each expected result must describe what the tester can observe after that step.

Expected results must:
- be concrete
- be tied to the action
- describe visible state, enabled/disabled state, data presence, changed value, or workflow state
- avoid vague statements like "works correctly" or "saves successfully"

Good:
- "The selected record opens in an editable state."
- "The new pay adjustment appears in the list."
- "The entered value remains visible after reopening the time card."
- "The submitted time card opens in review mode."
- "The updated record is visible after sync."

Bad:
- "The system behaves as expected."
- "The save succeeds."

If exact message text is unknown, describe the state without inventing wording.

==================================================
SCENARIO SELECTION RULES
==================================================
Select scenarios based on the actual ticket content.

For bug fixes:
- include the primary regression scenario
- include a nearby negative/persistence scenario if relevant
- include sync/reopen coverage when the bug affects saved data

For new features:
- include visibility/access
- include primary create/edit/use flow
- include persistence or reopen behavior
- include validation/required-field coverage if implied
- include role/config coverage if implied

For sync/server tickets:
- include initial behavior
- include update propagation/delta behavior
- include stale-data, duplicate, or persistence coverage when supported
- verify through observable UI/workflow outcomes, not backend internals

For permissions/config tickets:
- include allowed behavior for the intended role/state
- include blocked/invisible behavior for non-eligible role/state when supported
- include downstream impact of the config

For pay adjustment/time card tickets:
- consider add/edit/delete/override/review/status-specific editability
- include value persistence/reopen/sync when relevant
- include totals/rates only when the ticket or evidence supports calculation-related verification

For UI-only tickets:
- include the primary interaction
- include the relevant state update
- avoid inventing deep workflow coverage unless the ticket implies it

==================================================
PERSISTENCE / SYNC / REOPEN RULES
==================================================
When the ticket involves saved data, syncing, or mobile workflow, strongly consider at least one of:
- reopen the record
- app background/foreground
- app close and relaunch
- sync and verify
- open the same record on a related surface
- review mode / read-only mode
- updated data after status change

Only include these when they are relevant to the ticket.

==================================================
ROLE / STATUS / STATE RULES
==================================================
When the ticket depends on role, status, or state:
- include that in preconditions
- reflect it in the action flow
- verify the behavior appropriate to that role/status/state

Examples:
- open vs submitted vs review vs approved time card
- mechanic vs manager
- editable vs read-only state
- configured vs not configured feature access

Do NOT invent status names unless they are supported by the ticket/context.

==================================================
PRIORITY RULES
==================================================
Set priority using business impact, not guesswork.

Critical:
- data loss
- sync corruption
- payroll/pay adjustment/rate/totals issue
- destructive workflow failure
- cross-surface mismatch affecting core workflow

High:
- primary workflow blocked or incorrect
- review/approval workflow incorrect
- saved data not retained
- role/config behavior wrong for main user path

Medium:
- secondary workflow issue
- workaround exists
- non-core validation or UI issue with clear impact

Low:
- cosmetic-only issue
- wording-only issue
- low-risk edge case

==================================================
LABEL RULES
==================================================
Always include:
- "Regression"
- the ticket key
- a concise feature area label

When useful, also include:
- surface label such as Mobile, Desktop, Sync, TimeCard, WorkOrders, PayAdjustments, Review, Setup, Permissions, UI

Do not add random labels that are not useful for organization.

==================================================
DEDUPLICATION RULES
==================================================
When several tickets cover overlapping behavior:
- avoid generating the same flow multiple times with minor wording changes
- merge cases when the validation naturally overlaps
- keep separate cases only when the user role, status, validation type, or workflow outcome is meaningfully different

==================================================
QUALITY GATE BEFORE RETURN
==================================================
Before finalizing output, silently check:

1. Did I invent any unsupported UI labels, exact paths, or messages?
2. Are the steps executable by a tester?
3. Does each step have a matching expected result?
4. Are expected results observable?
5. Are preconditions necessary and believable?
6. Are there duplicate or near-duplicate cases?
7. Does each case validate a real regression risk from the ticket?
8. If the ticket is vague, did I use safe fallback wording instead of fake specificity?

If the ticket lacks detail, still produce useful test cases — but remain conservative and non-fabricated.
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

def _build_test_generation_ticket_view(tickets: list[dict]) -> list[dict]:
    return [
        {
            "key": str(t.get("key", "")),
            "summary": str(t.get("summary", "")),
            "issue_type": str(t.get("issue_type", "")),
            "labels": t.get("labels") or [],
            "components": t.get("components") or [],
            "description": str(t.get("description", ""))[:4000],
            "acceptance_criteria": str(t.get("acceptance_criteria", ""))[:3000],
            "repro_steps": str(t.get("repro_steps", ""))[:2000],
        }
        for t in tickets
    ]

async def generate_test_cases(tickets: list[dict], user_message: str = "") -> dict:
    client = _get_client()
    ticket_view = _build_test_generation_ticket_view(tickets)
    ticket_context = json.dumps(ticket_view, indent=2, default=str)

    prompt = f"""
Generate structured Zephyr Scale regression test cases from the Jira tickets below.

IMPORTANT:
- Operate in ticket-only mode unless explicit UI/code evidence is included below.
- Prefer correctness over false specificity.
- Do not invent exact UI labels, screen names, navigation paths, dialog text, field names, or validation text unless they are clearly present in the ticket context.
- Use controlled fallback wording when runtime details are unclear.
- Return JSON only, matching the provided schema exactly.

## Ticket Batch Goal
Create the smallest set of high-value regression test cases that covers the real risk in these tickets without producing duplicates.

## Tickets
{ticket_context}

## Additional Instructions
{user_message if user_message else "Generate practical regression test cases with conservative, non-hallucinated UI detail."}
"""

    response = await client.aio.models.generate_content(
        model=read_preferences()["ai_model"],
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            max_output_tokens=16384,
            temperature=0.15,
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
        if tickets:
            ticket_summary = json.dumps(
                _build_test_generation_ticket_view(tickets),
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
        if tickets:
            ticket_summary = json.dumps(
                _build_test_generation_ticket_view(tickets),
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
