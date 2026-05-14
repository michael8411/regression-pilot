"""ContextBundle shape + golden snapshot tests — Phase 1 MCP refactor."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from services.context_bundle_service import (
    build_context_bundle,
    signals_from_ticket,
    ticket_context_from_dict,
)


FIXTURE = {
    "key": "FM-101",
    "summary": "Pay adjustment not saved after reopen",
    "issue_type": "Bug",
    "priority": "High",
    "labels": ["Regression", "API", "PayAdjustments"],
    "components": [{"name": "Backend"}, "Mobile"],
    "description": "Steps: 1) open card 2) add adjustment 3) reopen — value missing.",
    "acceptance_criteria": "Value must persist after reopen.",
    "comments": [
        {"author": "qa1", "created": "2024-01-02T00:00:00Z", "body": "Repro confirmed"},
        {"author": "dev1", "created": "2024-01-01T00:00:00Z", "body": "Looking into it"},
    ],
    "linked_issues": [
        {"key": "FM-200", "relation": "relates to", "summary": "Sync layer"},
    ],
    "development_links": ["https://github.com/hcss/e360/pull/777"],
    "fix_versions": ["2024.02"],
}


class TestSignalsFromTicket:
    def test_extracts_project_key_from_issue_key(self):
        s = signals_from_ticket(FIXTURE)
        assert s.project_key == "FM"
        assert s.key == "FM-101"

    def test_pr_link_detected(self):
        s = signals_from_ticket(FIXTURE)
        assert s.has_pr_link() is True

    def test_normalized_labels_uppercase(self):
        s = signals_from_ticket(FIXTURE)
        assert "API" in s.normalized_labels()


class TestTicketContextFromDict:
    def test_includes_acceptance_in_description(self):
        ctx = ticket_context_from_dict(FIXTURE)
        assert "Acceptance Criteria" in ctx.description
        assert "persist after reopen" in ctx.description

    def test_quality_flags_compute(self):
        ctx = ticket_context_from_dict(FIXTURE)
        flags = ctx.quality_flags
        assert flags.missing_description is False
        assert flags.missing_acceptance_criteria is False
        assert flags.missing_dev_links is False

    def test_comments_sorted_by_created(self):
        ctx = ticket_context_from_dict(FIXTURE)
        creates = [c.created for c in ctx.comments]
        assert creates == sorted(creates)

    def test_components_handle_mixed_types(self):
        ctx = ticket_context_from_dict(FIXTURE)
        assert "Backend" in ctx.components
        assert "Mobile" in ctx.components


class TestBuildContextBundle:
    def test_ticket_only_mode_smoke(self):
        bundle = asyncio.run(build_context_bundle(FIXTURE))
        assert bundle.ticket.key == "FM-101"
        # No adapters configured -> tool_trace records skipped providers
        assert bundle.tool_trace.providers_called == []
        # Budget present and within cap
        assert bundle.budget.hard_cap_chars > 0
        assert bundle.budget.input_chars <= bundle.budget.hard_cap_chars

    def test_records_routing_decisions_for_all_providers(self):
        bundle = asyncio.run(build_context_bundle(FIXTURE))
        providers = [d.provider for d in bundle.tool_trace.routing_decisions]
        assert set(providers) == {
            "atlassian",
            "github",
            "ado",
            "sql_server",
            "zephyr_read",
        }

    def test_golden_snapshot_deterministic(self):
        """Two builds of the same fixture must serialize identically."""
        b1 = asyncio.run(build_context_bundle(FIXTURE))
        b2 = asyncio.run(build_context_bundle(FIXTURE))
        # Latency fields are nondeterministic — strip before comparing.
        d1 = b1.model_dump()
        d2 = b2.model_dump()
        d1["tool_trace"]["latency_ms"] = {}
        d2["tool_trace"]["latency_ms"] = {}
        assert d1 == d2

    def test_golden_shape_keys(self):
        bundle = asyncio.run(build_context_bundle(FIXTURE))
        dumped = bundle.model_dump()
        assert set(dumped.keys()) == {
            "ticket",
            "code_context",
            "db_context",
            "existing_tests",
            "tool_trace",
            "budget",
        }
        # Ticket key + project routing visible in trace decisions
        atl = next(
            d for d in dumped["tool_trace"]["routing_decisions"]
            if d["provider"] == "atlassian"
        )
        # No adapter wired in Phase 1 -> routing records skipped reason
        assert "skipped_provider_unavailable" in atl["reasons"]
