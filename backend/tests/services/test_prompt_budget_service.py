"""Prompt budget truncation tests — Phase 1 MCP refactor."""

from __future__ import annotations

from schemas.context_bundle_models import (
    ChangedFile,
    CodeContext,
    ContextBundle,
    FileDiffChunk,
    ReviewComment,
    TicketComment,
    TicketContext,
)
from services.prompt_budget_service import BudgetPolicy, apply_budget


def _bundle(**ticket_kwargs) -> ContextBundle:
    t = TicketContext(key="FM-1", summary="s", description="d", **ticket_kwargs)
    return ContextBundle(ticket=t)


class TestApplyBudget:
    def test_records_section_chars(self):
        b = _bundle()
        out = apply_budget(b)
        assert "ticket" in out.budget.per_section_chars
        assert out.budget.hard_cap_chars == BudgetPolicy().hard_cap

    def test_trims_oldest_comments_first(self):
        comments = [
            TicketComment(author="a", created=f"2024-01-{i:02d}", body="x" * 2000)
            for i in range(1, 10)
        ]
        b = _bundle(comments=comments)
        policy = BudgetPolicy(ticket=4000)
        out = apply_budget(b, policy)
        # Some early comments dropped
        assert len(out.ticket.comments) < 9
        # The newest comment (last in sorted order) must survive
        kept_creates = [c.created for c in out.ticket.comments]
        assert "2024-01-09" in kept_creates
        assert "ticket" in out.budget.truncated_sections

    def test_dedupes_review_comments(self):
        rc = ReviewComment(author="a", body="same", path="f.py", line=1)
        b = ContextBundle(
            ticket=TicketContext(key="FM-1", summary="s", description="d"),
            code_context=CodeContext(review_comments=[rc, rc, rc]),
        )
        out = apply_budget(b)
        assert len(out.code_context.review_comments) == 1

    def test_drops_file_diffs_when_over_budget(self):
        diffs = [
            FileDiffChunk(path=f"f{i}.py", patch="x" * 5000) for i in range(10)
        ]
        b = ContextBundle(
            ticket=TicketContext(key="FM-1", summary="s", description="d"),
            code_context=CodeContext(file_diffs=diffs),
        )
        policy = BudgetPolicy(code_context=12_000)
        out = apply_budget(b, policy)
        assert len(out.code_context.file_diffs) < 10
        assert "code_context" in out.budget.truncated_sections

    def test_never_exceeds_hard_cap(self):
        huge_desc = "x" * 200_000
        diffs = [
            FileDiffChunk(path=f"f{i}.py", patch="y" * 30_000) for i in range(20)
        ]
        b = ContextBundle(
            ticket=TicketContext(key="FM-1", summary="s", description=huge_desc),
            code_context=CodeContext(file_diffs=diffs),
        )
        out = apply_budget(b)
        assert out.budget.input_chars <= out.budget.hard_cap_chars

    def test_deterministic_output(self):
        c1 = _make_loaded_bundle()
        c2 = _make_loaded_bundle()
        o1 = apply_budget(c1)
        o2 = apply_budget(c2)
        assert o1.model_dump() == o2.model_dump()


def _make_loaded_bundle() -> ContextBundle:
    return ContextBundle(
        ticket=TicketContext(
            key="FM-7",
            summary="Sync issue",
            description="x" * 9000,
            labels=["API", "SYNC"],
            comments=[
                TicketComment(author="a", created="2024-01-01", body="c" * 500)
                for _ in range(8)
            ],
        ),
        code_context=CodeContext(
            pr_title="fix",
            pr_description="d" * 1000,
            changed_files=[
                ChangedFile(path=f"f{i}.py", status="modified") for i in range(4)
            ],
            file_diffs=[
                FileDiffChunk(path=f"f{i}.py", patch="p" * 4000) for i in range(4)
            ],
        ),
    )
