import json
import re
import uuid
from typing import AsyncIterator

import structlog
from google import genai
from google.genai import types

try:
    from backend.config.settings import get_settings
    from backend.config.preferences import read_preferences
    from backend.schemas.context_bundle_models import ContextBundle
    from backend.utils.secret_scanner import redact_for_external as _redact_for_external
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from config.settings import get_settings
    from config.preferences import read_preferences
    from schemas.context_bundle_models import ContextBundle
    from utils.secret_scanner import redact_for_external as _redact_for_external

_log = structlog.get_logger("testdeck.ai_service")

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


def redact_prompt_for_external(prompt: str, *, context: str) -> tuple[str, list[str]]:
    """Redact secrets in prompt and return (redacted_prompt, pattern_names).

    Logs pattern names and count only — never logs the matched values or prompt body.
    """
    redacted, findings = _redact_for_external(prompt)
    pattern_names = sorted({
        f.get("pattern_name")
        for f in findings
        if isinstance(f, dict) and f.get("pattern_name")
    })
    if pattern_names:
        _log.warning(
            "outbound_ai_prompt_redacted",
            context=context,
            pattern_names=pattern_names,
            finding_count=len(findings),
        )
    return redacted, pattern_names


def _redact_messages(messages: list[dict]) -> tuple[list[dict], list[str]]:
    """Return a redacted copy of messages and sorted union of pattern names found."""
    all_warnings: set[str] = set()
    out: list[dict] = []
    for msg in messages:
        content = str(msg.get("content", ""))
        redacted, warnings = redact_prompt_for_external(content, context="chat_content")
        all_warnings.update(warnings)
        out.append({**msg, "content": redacted} if warnings else msg)
    return out, sorted(all_warnings)


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

    prompt, scan_warnings = redact_prompt_for_external(prompt, context="generate_test_cases")

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

    result = json.loads(response.text)
    if scan_warnings:
        result["secret_scan_warnings"] = [{"pattern_name": p} for p in scan_warnings]
    return result


def _priority_bucket(priority: str) -> str:
    p = (priority or "").strip().lower()
    if p in {"critical", "highest", "blocker"}:
        return "critical"
    if p == "high":
        return "high"
    if p == "low":
        return "low"
    return "medium"


def _render_generation_rules(bundle: ContextBundle) -> list[str]:
    """Priority-aware generation rules based on routed signals.

    Stays compact so it doesn't bloat the prompt: bullets only, no prose.
    """
    bucket = _priority_bucket(bundle.ticket.priority)
    labels = {l.upper() for l in bundle.ticket.labels}
    is_regression = "REGRESSION-CANDIDATE" in labels

    lines: list[str] = ["## Generation Rules"]
    if bucket == "critical" or is_regression:
        lines.append(
            "- Depth: max. Cover the primary regression scenario, at least one"
            " edge/boundary case tied to the diff, and persistence/sync"
            " where the ticket implies saved data."
        )
    elif bucket == "high":
        lines.append(
            "- Depth: high. Cover the primary workflow + one negative or"
            " persistence scenario when supported by the ticket."
        )
    elif bucket == "low":
        lines.append("- Depth: low. One or two focused cases is sufficient.")
    else:
        lines.append("- Depth: medium. 2-4 focused cases.")

    if bundle.code_context.file_diffs:
        lines.append(
            "- Diff present: include at least one case that exercises the"
            " specific logic change visible in the diff."
        )
    if bundle.db_context.tables:
        lines.append(
            "- DB context present: include a data-integrity assertion tied"
            " to the inferred entities."
        )
    if bundle.existing_tests.tests:
        lines.append(
            "- Existing Zephyr tests are listed below — DO NOT duplicate"
            " their coverage; add complementary cases only."
        )
    return lines


def _render_bundle_for_prompt(bundle: ContextBundle) -> str:
    """Serialize a ContextBundle to the model-facing block.

    Reads ONLY from the budgeted bundle — never from raw provider responses.
    Section order matches the Phase 3 prompt assembly contract:
        1. Ticket Context
        2. Code Context (if present)
        3. Database Context (if present)
        4. Existing Test Cases (if present)
        5. Generation Rules (priority-aware)
    Empty sections are skipped to keep token usage tight.
    """
    t = bundle.ticket
    lines: list[str] = []

    # 1) Ticket Context
    lines.append("## Ticket Context")
    lines.append(f"- key: {t.key}")
    if t.issue_type:
        lines.append(f"- issue_type: {t.issue_type}")
    if t.priority:
        lines.append(f"- priority: {t.priority}")
    if t.labels:
        lines.append(f"- labels: {', '.join(t.labels)}")
    if t.components:
        lines.append(f"- components: {', '.join(t.components)}")
    if t.summary:
        lines.append(f"- summary: {t.summary}")
    if t.description:
        lines.append("- description:")
        lines.append(t.description)
    if t.comments:
        lines.append(f"- comments ({len(t.comments)}):")
        for c in t.comments:
            lines.append(f"  - {c.author}: {c.body}")
    if t.linked_issues:
        joined = ", ".join(
            f"{li.key}({li.relation})" if li.relation else li.key
            for li in t.linked_issues
        )
        lines.append(f"- linked: {joined}")

    flags = t.quality_flags
    flag_bits = [name for name, v in flags.model_dump().items() if v]
    if flag_bits:
        lines.append(f"- quality_flags: {', '.join(flag_bits)}")

    # 2) Code Context
    c = bundle.code_context
    if c.platform != "none" or c.pr_title or c.changed_files or c.file_diffs:
        lines.append("")
        lines.append("## Code Context")
        if c.pr_title:
            lines.append(f"- pr_title: {c.pr_title}")
        if c.pr_state:
            lines.append(f"- pr_state: {c.pr_state}")
        if c.target_branch:
            lines.append(f"- target_branch: {c.target_branch}")
        if c.changed_files:
            lines.append(f"- changed_files ({len(c.changed_files)}):")
            for f in c.changed_files:
                lines.append(
                    f"  - {f.path} [{f.status}] +{f.additions}/-{f.deletions}"
                )
        if c.file_diffs:
            lines.append("- diffs:")
            for fd in c.file_diffs:
                lines.append(f"  - {fd.path}")
                lines.append(fd.patch)
        if c.review_comments:
            lines.append(f"- review_comments ({len(c.review_comments)}):")
            for rc in c.review_comments:
                loc = f" {rc.path}:{rc.line}" if rc.path else ""
                lines.append(f"  - {rc.author}{loc}: {rc.body}")

    # 3) Database Context
    d = bundle.db_context
    if d.tables:
        lines.append("")
        lines.append("## Database Context")
        for tbl in d.tables:
            cols = ", ".join(
                str(col.get("name", ""))
                for col in tbl.columns
                if isinstance(col, dict)
            )
            lines.append(f"- {tbl.name}: {cols}")

    # 4) Existing Test Cases (dedupe guard)
    e = bundle.existing_tests
    if e.tests:
        lines.append("")
        lines.append("## Existing Test Cases (do not duplicate)")
        for et in e.tests:
            tag = f" [{et.last_status}]" if et.last_status else ""
            lines.append(f"- {et.name}{tag}")

    # 5) Generation Rules
    lines.append("")
    lines.extend(_render_generation_rules(bundle))

    return "\n".join(lines)


async def generate_test_cases_from_bundle(
    bundle: ContextBundle,
    user_message: str = "",
) -> dict:
    """Phase 1 routed-context generation entry point.

    Mirrors `generate_test_cases` but reads from the budgeted ContextBundle.
    Returns the same dict shape, so callers can swap incrementally.
    """
    client = _get_client()
    context_block = _render_bundle_for_prompt(bundle)

    prompt = f"""
Generate structured Zephyr Scale regression test cases for the ticket below.

IMPORTANT:
- The context block has been pre-routed and size-budgeted. Do not assume any
  information beyond what is shown. If a field is absent, treat it as unknown.
- Prefer correctness over false specificity. Use controlled fallback wording
  when runtime details are unclear.
- Return JSON only, matching the provided schema exactly.

{context_block}

## Additional Instructions
{user_message if user_message else "Generate practical regression test cases with conservative, non-hallucinated UI detail."}
"""

    prompt, scan_warnings = redact_prompt_for_external(
        prompt, context="generate_test_cases_from_bundle"
    )

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
    result = json.loads(response.text)
    if scan_warnings:
        result["secret_scan_warnings"] = [{"pattern_name": p} for p in scan_warnings]
    return result


_GROUPING_MODEL = "gemini-2.5-flash-lite"

def _build_grouping_ticket_view(tickets: list[dict]) -> list[dict]:
    return [
        {
            "key": str(t.get("key", "")),
            "summary": str(t.get("summary", ""))[:160],
            "labels": t.get("labels") or [],
            "components": t.get("components") or [],
            "issue_type": str(t.get("issue_type", "")),
        }
        for t in tickets
    ]


async def group_tickets_semantic(tickets: list[dict]) -> dict:
    if not tickets:
        return {"groups": []}

    keys = [str(t.get("key", "")).strip() for t in tickets if t.get("key")]
    if not keys:
        return {"groups": []}

    min_groups = 3 if len(tickets) >= 8 else 2
    max_groups = 6
    target_groups = min(max_groups, max(min_groups, round(len(tickets) ** 0.5)))

    ticket_view = _build_grouping_ticket_view(tickets)

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

    prompt, _ = redact_prompt_for_external(prompt, context="group_tickets_semantic")

    client = _get_client()
    try:
        response = await client.aio.models.generate_content(
            model=_GROUPING_MODEL,
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

    system, _ = redact_prompt_for_external(system, context="chat_message.system")
    redacted_messages, _ = _redact_messages(messages)
    contents = _build_contents(redacted_messages)

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
    tool_catalog: list[dict] | None = None,
) -> AsyncIterator[str | dict]:
    """Stream Gemini output as text chunks, plus tool_call dicts when the
    model emits a `<tool name="..." connection="...">{...}</tool>` tag.

    Yields:
      - `str` for plain text chunks.
      - `{"tool_call": {request_id, connection_id, tool, input}}` when a tag closes.

    Tool calls follow the documented tag-based fallback: universal across
    Gemini models, no function-calling complexity. The tag parser buffers
    text so multi-chunk tags reassemble before parsing JSON.
    """
    client = _get_client()
    prefs = read_preferences()

    system = SYSTEM_INSTRUCTION
    if tickets:
        ticket_summary = json.dumps(
            _build_test_generation_ticket_view(tickets),
            indent=2,
        )
        system += f"\n\n## Current Ticket Context\n{ticket_summary}"

    if tool_catalog:
        system += _build_tool_catalog_prompt(tool_catalog)

    # Redact outbound copies — original messages list is not mutated.
    system, sys_warnings = redact_prompt_for_external(
        system, context="stream_chat_message.system"
    )
    redacted_messages, msg_warnings = _redact_messages(messages)
    all_warnings = sorted(set(sys_warnings) | set(msg_warnings))
    if all_warnings:
        yield {"secret_scan_warnings": [{"pattern_name": p} for p in all_warnings]}

    contents = _build_contents(redacted_messages)

    parser = _ToolCallStreamParser() if tool_catalog else None

    async for chunk in await client.aio.models.generate_content_stream(
        model=prefs["ai_model"],
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=4096,
            temperature=prefs["ai_temperature"],
        ),
    ):
        if not chunk.text:
            continue
        if parser is None:
            yield chunk.text
            continue
        for evt in parser.feed(chunk.text):
            yield evt
            if isinstance(evt, dict) and "tool_call" in evt:
                # Stop pulling further chunks; conversation_service handles
                # the pause/resume cycle.
                return

    if parser is not None:
        # Flush any trailing buffered text.
        tail = parser.flush()
        if tail:
            yield tail


def _build_tool_catalog_prompt(catalog: list[dict]) -> str:
    """System prompt that teaches the model how to request a tool call."""
    if not catalog:
        return ""
    lines = [
        "",
        "## Available MCP tools",
        "",
        "When you need to call one of these tools, emit EXACTLY one tag with",
        "JSON arguments inside, then stop talking. The tag format is:",
        "",
        '<tool name="TOOL_NAME" connection="CONNECTION_ID">{ ...json input... }</tool>',
        "",
        "Rules:",
        "- Emit at most one tool tag per turn.",
        "- The JSON between the tags MUST be valid JSON.",
        "- Do not nest tags. Do not paraphrase the tag.",
        "- Only call a tool when external data is genuinely required.",
        "- Prefer one focused tool call over multiple speculative calls.",
        "- Do not call SQL tools for general questions; only when the user",
        "  asks about tables, columns, schema, or procedures.",
        "- Never attempt write/update/delete/transition/merge actions. Only",
        "  read/search/get/list tools are exposed.",
        "- After the tool runs, the tool output will be shown to you on a",
        "  later turn so you can summarize it for the user.",
        "- If the tool you need is not in this list, explain the limitation",
        "  instead of fabricating an answer.",
        "",
        "Available tools:",
    ]
    for entry in catalog:
        conn = str(entry.get("connection_id", ""))
        tool = str(entry.get("tool", ""))
        desc = str(entry.get("description", "") or "").strip()
        line = f"- `{tool}` (connection `{conn}`)"
        if desc:
            line += f" — {desc[:200]}"
        lines.append(line)
        schema = entry.get("inputSchema")
        if isinstance(schema, dict) and schema:
            # Show parameter names + types so the model picks the right keys.
            props = schema.get("properties") if isinstance(schema, dict) else None
            if isinstance(props, dict) and props:
                summary_parts: list[str] = []
                for pname, pschema in list(props.items())[:8]:
                    if not isinstance(pschema, dict):
                        continue
                    ptype = pschema.get("type") or "any"
                    summary_parts.append(f"{pname}:{ptype}")
                required = schema.get("required")
                req_set = (
                    set(r for r in required if isinstance(r, str))
                    if isinstance(required, list)
                    else set()
                )
                if req_set:
                    summary_parts.append(
                        f"required={','.join(sorted(req_set))}"
                    )
                if summary_parts:
                    lines.append(f"  args: {', '.join(summary_parts)}")
    return "\n".join(lines)


class _ToolCallStreamParser:
    """Buffers text chunks and emits text or `tool_call` events.

    Only one tool call per turn — once we see a complete `<tool …>…</tool>`,
    we yield the event and the caller stops streaming.
    """

    _MAX_BUFFER = 8 * 1024

    def __init__(self) -> None:
        self._buf = ""
        self._in_tag = False

    def feed(self, chunk: str) -> list[str | dict]:
        self._buf += chunk
        out: list[str | dict] = []

        while True:
            if not self._in_tag:
                idx = self._buf.find("<tool ")
                if idx < 0:
                    # No tag in sight — flush most of the buffer as text,
                    # but hold a small lookahead in case a partial tag
                    # straddles the next chunk.
                    safe = max(0, len(self._buf) - 8)
                    if safe > 0:
                        out.append(self._buf[:safe])
                        self._buf = self._buf[safe:]
                    return out
                if idx > 0:
                    out.append(self._buf[:idx])
                    self._buf = self._buf[idx:]
                self._in_tag = True

            close = self._buf.find("</tool>")
            if close < 0:
                if len(self._buf) > self._MAX_BUFFER:
                    # Treat as malformed — flush as plain text and reset.
                    out.append(self._buf)
                    self._buf = ""
                    self._in_tag = False
                return out

            tag_text = self._buf[: close + len("</tool>")]
            self._buf = self._buf[close + len("</tool>") :]
            self._in_tag = False

            evt = _parse_tool_tag(tag_text)
            if evt is None:
                # Malformed — keep the raw text so the model's output is
                # never silently swallowed.
                out.append(tag_text)
            else:
                out.append({"tool_call": evt})

    def flush(self) -> str:
        text = self._buf
        self._buf = ""
        self._in_tag = False
        return text


_TOOL_TAG_RE = re.compile(
    r'<tool\s+name="(?P<name>[^"]+)"\s+connection="(?P<conn>[^"]+)"\s*>'
    r"(?P<json>.*?)</tool>",
    re.DOTALL,
)


def _parse_tool_tag(raw: str) -> dict | None:
    match = _TOOL_TAG_RE.search(raw)
    if not match:
        return None
    name = match.group("name").strip()
    conn = match.group("conn").strip()
    body = match.group("json").strip() or "{}"
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    return {
        "request_id": f"tc_{uuid.uuid4().hex[:12]}",
        "connection_id": conn,
        "tool": name,
        "input": payload,
    }


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
