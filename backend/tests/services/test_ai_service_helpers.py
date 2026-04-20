"""Tests for pure helper functions in ai_service.py."""

import pytest

from services.ai_service import (
    _build_contents,
    _build_test_generation_ticket_view,
    _fallback_group_tickets,
    _normalize_grouping_payload,
)


class TestBuildTestGenerationTicketView:

    def test_basic_roundtrip(self):
        tickets = [
            {
                "key": "FM-1",
                "summary": "Broken save",
                "issue_type": "Bug",
                "labels": ["Regression"],
                "components": ["Mobile"],
                "description": "Details",
                "acceptance_criteria": "AC",
                "repro_steps": "Steps",
            }
        ]
        result = _build_test_generation_ticket_view(tickets)
        assert result == [
            {
                "key": "FM-1",
                "summary": "Broken save",
                "issue_type": "Bug",
                "labels": ["Regression"],
                "components": ["Mobile"],
                "description": "Details",
                "acceptance_criteria": "AC",
                "repro_steps": "Steps",
            }
        ]

    def test_missing_fields_default_to_empty(self):
        result = _build_test_generation_ticket_view([{"key": "FM-2"}])
        assert result[0]["key"] == "FM-2"
        assert result[0]["summary"] == ""
        assert result[0]["description"] == ""
        assert result[0]["labels"] == []
        assert result[0]["components"] == []

    def test_description_truncated_to_4000(self):
        long_desc = "a" * 10_000
        result = _build_test_generation_ticket_view(
            [{"key": "FM-3", "description": long_desc}]
        )
        assert len(result[0]["description"]) == 4000

    def test_acceptance_criteria_truncated_to_3000(self):
        long_ac = "b" * 10_000
        result = _build_test_generation_ticket_view(
            [{"key": "FM-4", "acceptance_criteria": long_ac}]
        )
        assert len(result[0]["acceptance_criteria"]) == 3000

    def test_repro_steps_truncated_to_2000(self):
        long_steps = "c" * 10_000
        result = _build_test_generation_ticket_view(
            [{"key": "FM-5", "repro_steps": long_steps}]
        )
        assert len(result[0]["repro_steps"]) == 2000

    def test_none_labels_becomes_empty_list(self):
        result = _build_test_generation_ticket_view(
            [{"key": "FM-6", "labels": None, "components": None}]
        )
        assert result[0]["labels"] == []
        assert result[0]["components"] == []

    def test_empty_input_returns_empty_list(self):
        assert _build_test_generation_ticket_view([]) == []


class TestNormalizeGroupingPayload:

    def test_basic_grouping_preserved(self):
        payload = {
            "groups": [
                {"name": "Sync", "confidence": 0.9, "ticket_keys": ["FM-1", "FM-2"]},
            ],
            "needs_review_keys": [],
        }
        result = _normalize_grouping_payload(payload, ["FM-1", "FM-2"])
        assert len(result["groups"]) == 1
        assert result["groups"][0]["ticket_keys"] == ["FM-1", "FM-2"]

    def test_unknown_keys_filtered_out(self):
        payload = {
            "groups": [
                {"name": "Sync", "confidence": 0.9, "ticket_keys": ["FM-1", "NOT-REAL"]},
            ],
            "needs_review_keys": [],
        }
        result = _normalize_grouping_payload(payload, ["FM-1"])
        assert result["groups"][0]["ticket_keys"] == ["FM-1"]

    def test_duplicate_assignments_deduplicated(self):
        """A key that appears in two groups should land in the first one only."""
        payload = {
            "groups": [
                {"name": "A", "confidence": 0.9, "ticket_keys": ["FM-1", "FM-2"]},
                {"name": "B", "confidence": 0.9, "ticket_keys": ["FM-2", "FM-3"]},
            ],
            "needs_review_keys": [],
        }
        result = _normalize_grouping_payload(payload, ["FM-1", "FM-2", "FM-3"])
        all_keys = []
        for g in result["groups"]:
            all_keys.extend(g["ticket_keys"])
        assert all_keys.count("FM-2") == 1

    def test_unassigned_keys_land_in_needs_review(self):
        payload = {
            "groups": [
                {"name": "A", "confidence": 0.9, "ticket_keys": ["FM-1"]},
            ],
            "needs_review_keys": [],
        }
        result = _normalize_grouping_payload(payload, ["FM-1", "FM-2", "FM-3"])
        review = next(g for g in result["groups"] if g["name"] == "Needs Review")
        assert set(review["ticket_keys"]) == {"FM-2", "FM-3"}

    def test_confidence_clamped_to_0_to_1(self):
        payload = {
            "groups": [
                {"name": "High", "confidence": 2.5, "ticket_keys": ["FM-1"]},
                {"name": "Low", "confidence": -1.0, "ticket_keys": ["FM-2"]},
            ],
            "needs_review_keys": [],
        }
        result = _normalize_grouping_payload(payload, ["FM-1", "FM-2"])
        by_name = {g["name"]: g for g in result["groups"]}
        assert by_name["High"]["confidence"] == 1.0
        assert by_name["Low"]["confidence"] == 0.0

    def test_group_name_truncated_to_48_chars(self):
        long_name = "X" * 100
        payload = {
            "groups": [
                {"name": long_name, "confidence": 0.9, "ticket_keys": ["FM-1"]},
            ],
            "needs_review_keys": [],
        }
        result = _normalize_grouping_payload(payload, ["FM-1"])
        assert len(result["groups"][0]["name"]) == 48

    def test_empty_group_name_becomes_general(self):
        payload = {
            "groups": [
                {"name": "   ", "confidence": 0.9, "ticket_keys": ["FM-1"]},
            ],
            "needs_review_keys": [],
        }
        result = _normalize_grouping_payload(payload, ["FM-1"])
        assert result["groups"][0]["name"] == "General"

    def test_overflow_groups_go_to_needs_review(self):
        """More than 6 groups: extras become Needs Review entries."""
        payload = {
            "groups": [
                {"name": f"Group{i}", "confidence": 0.9, "ticket_keys": [f"FM-{i}"]}
                for i in range(8)
            ],
            "needs_review_keys": [],
        }
        all_keys = [f"FM-{i}" for i in range(8)]
        result = _normalize_grouping_payload(payload, all_keys)
        assert len(result["groups"]) == 7
        assert result["groups"][-1]["name"] == "Needs Review"


class TestFallbackGroupTickets:

    def _group_for(self, result: dict, ticket_key: str) -> str | None:
        for g in result["groups"]:
            if ticket_key in g["ticket_keys"]:
                return g["name"]
        return None

    def test_pay_adjustment_keyword_routes_correctly(self):
        tickets = [{"key": "FM-1", "summary": "Add pay adjustment button"}]
        result = _fallback_group_tickets(tickets)
        assert self._group_for(result, "FM-1") == "Pay Adjustments / Time Cards"

    def test_timecard_normalized_keyword(self):
        tickets = [{"key": "FM-2", "summary": "TimeCard bug on reopen"}]
        result = _fallback_group_tickets(tickets)
        assert self._group_for(result, "FM-2") == "Pay Adjustments / Time Cards"

    def test_work_order_keyword(self):
        tickets = [{"key": "FM-3", "summary": "Fix work order close flow"}]
        result = _fallback_group_tickets(tickets)
        assert self._group_for(result, "FM-3") == "Work Orders"

    def test_sync_keyword(self):
        tickets = [{"key": "FM-4", "summary": "Sync delta broken"}]
        result = _fallback_group_tickets(tickets)
        assert self._group_for(result, "FM-4") == "Sync & Data Flow"

    def test_ui_keyword(self):
        tickets = [{"key": "FM-5", "summary": "Modal button misaligned"}]
        result = _fallback_group_tickets(tickets)
        assert self._group_for(result, "FM-5") == "UI / UX"

    def test_api_keyword(self):
        tickets = [{"key": "FM-6", "summary": "SQL query returns duplicates"}]
        result = _fallback_group_tickets(tickets)
        assert self._group_for(result, "FM-6") == "API / Backend"

    def test_uncategorized_falls_to_general(self):
        tickets = [{"key": "FM-7", "summary": "Completely unrelated request"}]
        result = _fallback_group_tickets(tickets)
        assert self._group_for(result, "FM-7") == "General"

    def test_empty_buckets_not_returned(self):
        tickets = [{"key": "FM-1", "summary": "Fix pay adjustment"}]
        result = _fallback_group_tickets(tickets)
        assert len(result["groups"]) == 1

    def test_groups_sorted_by_size_desc(self):
        tickets = (
            [{"key": f"PA-{i}", "summary": "pay adjustment"} for i in range(5)]
            + [{"key": f"WO-{i}", "summary": "work order"} for i in range(2)]
        )
        result = _fallback_group_tickets(tickets)
        sizes = [len(g["ticket_keys"]) for g in result["groups"]]
        assert sizes == sorted(sizes, reverse=True)


class TestBuildContents:

    def test_user_role_preserved(self):
        result = _build_contents([{"role": "user", "content": "hi"}])
        assert len(result) == 1
        assert result[0].role == "user"

    def test_assistant_role_mapped_to_model(self):
        """Gemini uses `model` for the assistant side; our API uses `assistant`."""
        result = _build_contents([{"role": "assistant", "content": "response"}])
        assert result[0].role == "model"

    def test_alternating_conversation(self):
        messages = [
            {"role": "user", "content": "q1"},
            {"role": "assistant", "content": "a1"},
            {"role": "user", "content": "q2"},
        ]
        result = _build_contents(messages)
        assert [c.role for c in result] == ["user", "model", "user"]

    def test_empty_list_returns_empty(self):
        assert _build_contents([]) == []
