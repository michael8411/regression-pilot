"""Character budgets + deterministic truncation for ContextBundle.

This is the policy hook that keeps token usage bounded. Phase 1 ships
character-based budgets (cheap, deterministic, model-independent).
Token-accurate accounting can be layered later without changing the
shape of the API.

Compression order (lowest signal first):
    1. older comments (keep newest)
    2. duplicate review comments by (path, line, body) tuple
    3. older status history entries
    4. full file diffs — trim from the tail (oldest changes first)
    5. table schemas — keep referenced tables, drop the rest

The function ALWAYS returns a bundle that fits under the hard cap or marks
sections as truncated and records section-level char counts in
bundle.budget.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

try:
    from backend.schemas.context_bundle_models import (
        BudgetStats,
        ContextBundle,
    )
except ImportError:  # pragma: no cover
    from schemas.context_bundle_models import BudgetStats, ContextBundle


@dataclass(frozen=True)
class BudgetPolicy:
    """Per-section character budgets. Hard cap is the sum target."""

    ticket: int = 10_000
    code_context: int = 22_000
    db_context: int = 10_000
    existing_tests: int = 6_000
    instructions: int = 4_000
    hard_cap: int = 52_000


DEFAULT_POLICY = BudgetPolicy()


# --- public API --------------------------------------------------------------


def apply_budget(
    bundle: ContextBundle,
    policy: BudgetPolicy = DEFAULT_POLICY,
) -> ContextBundle:
    """Mutate-and-return the bundle so each section fits under its budget.

    Pure-deterministic: no randomness, no clocks. Tests rely on this.
    """

    truncated: list[str] = []

    # 1) ticket
    t_chars, t_trim = _trim_ticket(bundle, policy.ticket)
    if t_trim:
        truncated.append("ticket")

    # 2) code_context
    c_chars, c_trim = _trim_code_context(bundle, policy.code_context)
    if c_trim:
        truncated.append("code_context")

    # 3) db_context
    d_chars, d_trim = _trim_db_context(bundle, policy.db_context)
    if d_trim:
        truncated.append("db_context")

    # 4) existing_tests
    e_chars, e_trim = _trim_existing_tests(bundle, policy.existing_tests)
    if e_trim:
        truncated.append("existing_tests")

    total = t_chars + c_chars + d_chars + e_chars

    # Hard cap defense — if we somehow overshoot (shouldn't, but safety net),
    # shave the largest section until we're under cap.
    while total > policy.hard_cap:
        # Pick the largest remaining section and trim 10% off it.
        sizes = {
            "code_context": c_chars,
            "ticket": t_chars,
            "db_context": d_chars,
            "existing_tests": e_chars,
        }
        worst = max(sizes, key=sizes.get)
        cut = max(1, int(sizes[worst] * 0.1))
        if worst == "code_context":
            c_chars = _hard_trim_code(bundle, c_chars - cut)
            if "code_context" not in truncated:
                truncated.append("code_context")
        elif worst == "ticket":
            t_chars = _hard_trim_ticket(bundle, t_chars - cut)
            if "ticket" not in truncated:
                truncated.append("ticket")
        elif worst == "db_context":
            d_chars = _hard_trim_db(bundle, d_chars - cut)
            if "db_context" not in truncated:
                truncated.append("db_context")
        else:
            e_chars = _hard_trim_existing(bundle, e_chars - cut)
            if "existing_tests" not in truncated:
                truncated.append("existing_tests")
        total = t_chars + c_chars + d_chars + e_chars

    bundle.budget = BudgetStats(
        input_chars=total,
        per_section_chars={
            "ticket": t_chars,
            "code_context": c_chars,
            "db_context": d_chars,
            "existing_tests": e_chars,
        },
        hard_cap_chars=policy.hard_cap,
        truncated_sections=truncated,
    )
    return bundle


# --- per-section trimmers ----------------------------------------------------


def _trim_ticket(bundle: ContextBundle, budget: int) -> tuple[int, bool]:
    t = bundle.ticket
    truncated = False

    # Keep description short — preserve full text up to 60% of budget.
    desc_cap = int(budget * 0.6)
    if len(t.description) > desc_cap:
        t.description = t.description[:desc_cap]
        truncated = True

    # Comments: drop oldest until we fit remaining budget.
    while t.comments and _ticket_chars(t) > budget:
        t.comments.pop(0)
        truncated = True

    # If still over (single huge description), hard trim.
    if _ticket_chars(t) > budget:
        excess = _ticket_chars(t) - budget
        t.description = t.description[: max(0, len(t.description) - excess)]
        truncated = True

    return _ticket_chars(t), truncated


def _trim_code_context(bundle: ContextBundle, budget: int) -> tuple[int, bool]:
    c = bundle.code_context
    truncated = False

    # Dedupe review comments by (path, line, body).
    seen: set[tuple[str, int | None, str]] = set()
    unique: list = []
    for rc in c.review_comments:
        sig = (rc.path, rc.line, rc.body)
        if sig in seen:
            truncated = True
            continue
        seen.add(sig)
        unique.append(rc)
    c.review_comments = unique

    # Drop file diffs from the tail until we fit.
    while c.file_diffs and _code_chars(c) > budget:
        c.file_diffs.pop()
        truncated = True

    # If still over, drop oldest review comments.
    while c.review_comments and _code_chars(c) > budget:
        c.review_comments.pop(0)
        truncated = True

    # Trim PR description if needed.
    if _code_chars(c) > budget and len(c.pr_description) > 0:
        excess = _code_chars(c) - budget
        c.pr_description = c.pr_description[: max(0, len(c.pr_description) - excess)]
        truncated = True

    return _code_chars(c), truncated


def _trim_db_context(bundle: ContextBundle, budget: int) -> tuple[int, bool]:
    d = bundle.db_context
    truncated = False

    # Drop optional sections first.
    for attr in ("recent_changes", "views", "indexes", "constraints", "stored_procedures"):
        while getattr(d, attr) and _db_chars(d) > budget:
            getattr(d, attr).pop()
            truncated = True

    # Then trim tables from the tail.
    while d.tables and _db_chars(d) > budget:
        d.tables.pop()
        truncated = True

    return _db_chars(d), truncated


def _trim_existing_tests(bundle: ContextBundle, budget: int) -> tuple[int, bool]:
    e = bundle.existing_tests
    truncated = False
    while e.tests and _existing_chars(e) > budget:
        e.tests.pop()
        truncated = True
    return _existing_chars(e), truncated


# --- char counters (cheap, stable) ------------------------------------------


def _ticket_chars(t) -> int:
    total = (
        len(t.summary)
        + len(t.description)
        + len(t.issue_type)
        + len(t.priority)
        + sum(len(s) for s in t.labels)
        + sum(len(s) for s in t.components)
        + sum(len(s) for s in t.fix_versions)
        + sum(len(c.body) + len(c.author) for c in t.comments)
        + sum(len(l.key) + len(l.summary) + len(l.relation) for l in t.linked_issues)
        + sum(len(s) for s in t.development_links)
        + sum(len(a.name) + len(a.media_type) for a in t.attachments)
        + sum(len(s.from_status) + len(s.to_status) for s in t.status_history)
    )
    return total


def _code_chars(c) -> int:
    return (
        len(c.pr_title)
        + len(c.pr_description)
        + len(c.target_branch)
        + sum(len(m) for m in c.commit_messages)
        + sum(len(f.path) + len(f.status) for f in c.changed_files)
        + sum(len(f.patch) + len(f.path) for f in c.file_diffs)
        + sum(len(rc.body) + len(rc.path) + len(rc.author) for rc in c.review_comments)
    )


def _db_chars(d) -> int:
    # Approximate: serialize-free string-length sum over names.
    def _len_objs(items, key="name"):
        return sum(len(str(it.get(key, ""))) if isinstance(it, dict) else 0 for it in items)

    tables = sum(len(t.name) + sum(len(str(col)) for col in t.columns) for t in d.tables)
    return (
        tables
        + _len_objs(d.foreign_keys)
        + _len_objs(d.stored_procedures)
        + _len_objs(d.indexes)
        + _len_objs(d.constraints)
        + _len_objs(d.views)
        + _len_objs(d.recent_changes)
    )


def _existing_chars(e) -> int:
    return sum(len(t.name) + len(t.key) + len(t.last_status) for t in e.tests)


# --- hard-trim helpers used by the cap defense loop --------------------------


def _hard_trim_code(bundle: ContextBundle, target: int) -> int:
    c = bundle.code_context
    while _code_chars(c) > target and c.file_diffs:
        c.file_diffs.pop()
    while _code_chars(c) > target and c.review_comments:
        c.review_comments.pop()
    if _code_chars(c) > target:
        excess = _code_chars(c) - target
        c.pr_description = c.pr_description[: max(0, len(c.pr_description) - excess)]
    return _code_chars(c)


def _hard_trim_ticket(bundle: ContextBundle, target: int) -> int:
    t = bundle.ticket
    while _ticket_chars(t) > target and t.comments:
        t.comments.pop(0)
    if _ticket_chars(t) > target:
        excess = _ticket_chars(t) - target
        t.description = t.description[: max(0, len(t.description) - excess)]
    return _ticket_chars(t)


def _hard_trim_db(bundle: ContextBundle, target: int) -> int:
    d = bundle.db_context
    while _db_chars(d) > target and d.tables:
        d.tables.pop()
    return _db_chars(d)


def _hard_trim_existing(bundle: ContextBundle, target: int) -> int:
    e = bundle.existing_tests
    while _existing_chars(e) > target and e.tests:
        e.tests.pop()
    return _existing_chars(e)
