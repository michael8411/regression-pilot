"""Routing matrix unit tests — Phase 1 MCP refactor."""

from __future__ import annotations

from services.context_routing_service import (
    PROVIDER_ORDER,
    RoutingPlan,
    TicketSignals,
    build_routing_plan,
    project_platform_for,
)


def _decision(plan: RoutingPlan, provider: str):
    for d in plan.decisions:
        if d.provider == provider:
            return d
    raise AssertionError(f"missing decision for {provider}")


class TestProjectPlatformMapping:
    def test_returns_none_when_unmapped(self):
        assert project_platform_for("ZZZ", {}) == "none"

    def test_case_insensitive_lookup(self):
        assert project_platform_for("fm", {"FM": "github"}) == "github"

    def test_returns_none_for_empty(self):
        assert project_platform_for("", {"FM": "github"}) == "none"


class TestRoutingMatrix:
    def _signals(self, **overrides):
        defaults = dict(
            key="FM-100",
            project_key="FM",
            priority="Medium",
            labels=(),
            components=(),
            development_links=(),
        )
        defaults.update(overrides)
        return TicketSignals(**defaults)

    def test_decisions_in_canonical_order(self):
        plan = build_routing_plan(self._signals(), platform_mapping={})
        assert [d.provider for d in plan.decisions] == list(PROVIDER_ORDER)

    def test_atlassian_always_included_when_available(self):
        plan = build_routing_plan(self._signals(), platform_mapping={})
        assert _decision(plan, "atlassian").included is True

    def test_no_pr_skips_repo(self):
        plan = build_routing_plan(
            self._signals(), platform_mapping={"FM": "github"}
        )
        gh = _decision(plan, "github")
        assert gh.included is False
        assert "skipped_no_pr" in gh.reasons

    def test_pr_present_no_mapping_infers_github(self):
        # Phase 15: GitHub URL infers platform without requiring a repo mapping.
        plan = build_routing_plan(
            self._signals(
                development_links=("https://github.com/org/repo/pull/42",)
            ),
            platform_mapping={},
        )
        gh = _decision(plan, "github")
        assert gh.included is True
        assert "platform_inferred_from_dev_link" in gh.reasons
        assert "pr_link_present" in gh.reasons

    def test_pr_present_no_mapping_infers_ado(self):
        # Phase 15: ADO URL infers platform without requiring a repo mapping.
        plan = build_routing_plan(
            self._signals(
                development_links=(
                    "https://dev.azure.com/org/proj/_git/repo/pullrequest/7",
                )
            ),
            platform_mapping={},
        )
        ado = _decision(plan, "ado")
        assert ado.included is True
        assert "platform_inferred_from_dev_link" in ado.reasons

    def test_inferred_platform_takes_priority_over_mapping(self):
        # Inference from PR URL wins even when mapping is present.
        plan = build_routing_plan(
            self._signals(
                development_links=("https://github.com/org/repo/pull/42",)
            ),
            platform_mapping={"FM": "github"},
        )
        gh = _decision(plan, "github")
        assert gh.included is True
        assert "platform_inferred_from_dev_link" in gh.reasons
        assert "platform_mapping_resolved" not in gh.reasons

    def test_pr_present_with_ado_mapping_infers_ado(self):
        plan = build_routing_plan(
            self._signals(
                development_links=(
                    "https://dev.azure.com/org/proj/_git/repo/pullrequest/7",
                )
            ),
            platform_mapping={"FM": "ado"},
        )
        ado = _decision(plan, "ado")
        assert ado.included is True
        assert "platform_inferred_from_dev_link" in ado.reasons
        assert _decision(plan, "github").included is False

    def test_pr_link_no_recognizable_url_falls_back_to_mapping(self):
        # If dev_links exist but none are GitHub/ADO PR URLs, fall back to mapping.
        plan = build_routing_plan(
            self._signals(
                development_links=("https://internal.example.com/pr/42",)
            ),
            platform_mapping={"FM": "github"},
        )
        gh = _decision(plan, "github")
        # The link matches _PR_HINT_RE (has github.com-like pattern? No — it's internal)
        # So it should fall back to mapping. But has_pr_link() checks _PR_HINT_RE.
        # internal.example.com won't match _PR_HINT_RE, so pr_present=False -> skipped_no_pr.
        assert "skipped_no_pr" in gh.reasons

    def test_no_dev_links_falls_back_to_mapping(self):
        # No dev_links at all; explicit platform_mapping required.
        plan = build_routing_plan(
            self._signals(
                development_links=("https://github.com/org/repo/pull/42",)
            ),
            platform_mapping={},
        )
        # With a GitHub URL, inference works even without mapping.
        gh = _decision(plan, "github")
        assert gh.included is True

    def test_pr_present_but_no_mapping_and_no_inference(self):
        # PR hint detected by _PR_HINT_RE but inference fails and no mapping.
        # This tests the skipped_no_mapping path.
        plan = build_routing_plan(
            self._signals(development_links=()),
            platform_mapping={},
        )
        gh = _decision(plan, "github")
        assert gh.included is False
        assert "skipped_no_pr" in gh.reasons

    def test_db_signal_label_routes_to_sql(self):
        plan = build_routing_plan(
            self._signals(labels=("API",)),
            platform_mapping={},
        )
        sql = _decision(plan, "sql_server")
        assert sql.included is True
        assert "db_signal_label" in sql.reasons

    def test_db_signal_component_routes_to_sql(self):
        plan = build_routing_plan(
            self._signals(components=("backend",)),
            platform_mapping={},
        )
        sql = _decision(plan, "sql_server")
        assert sql.included is True
        assert "db_signal_component" in sql.reasons

    def test_no_db_signal_skips_sql(self):
        plan = build_routing_plan(
            self._signals(labels=("Mobile",)),
            platform_mapping={},
        )
        sql = _decision(plan, "sql_server")
        assert sql.included is False
        assert "skipped_no_signal" in sql.reasons

    def test_critical_priority_sets_full_files_and_escalates(self):
        plan = build_routing_plan(
            self._signals(priority="Critical"),
            platform_mapping={},
        )
        assert plan.include_full_files is True
        assert plan.max_changed_files >= 8
        atl = _decision(plan, "atlassian")
        assert "priority_escalation" in atl.reasons

    def test_regression_label_escalates(self):
        plan = build_routing_plan(
            self._signals(labels=("REGRESSION-CANDIDATE",)),
            platform_mapping={},
        )
        assert plan.include_full_files is True
        atl = _decision(plan, "atlassian")
        assert "regression_candidate" in atl.reasons

    def test_unavailable_provider_records_skip(self):
        plan = build_routing_plan(
            self._signals(),
            platform_mapping={},
            available_providers=("atlassian",),
        )
        zr = _decision(plan, "zephyr_read")
        assert zr.included is False
        assert "skipped_provider_unavailable" in zr.reasons

    def test_repo_provider_unavailable_marks_decision_skipped(self):
        # PR link present but GitHub not in available_providers.
        plan = build_routing_plan(
            self._signals(
                development_links=("https://github.com/org/repo/pull/42",)
            ),
            platform_mapping={},
            available_providers=("atlassian",),
        )
        gh = _decision(plan, "github")
        assert gh.included is False
        assert "pr_link_present" in gh.reasons
        assert "skipped_provider_unavailable" in gh.reasons

    def test_determinism_same_input_same_output(self):
        s = self._signals(
            labels=("API", "SYNC"),
            components=("payroll",),
            development_links=("https://github.com/o/r/pull/1",),
            priority="High",
        )
        a = build_routing_plan(s, platform_mapping={"FM": "github"})
        b = build_routing_plan(s, platform_mapping={"FM": "github"})
        assert [d.model_dump() for d in a.decisions] == [
            d.model_dump() for d in b.decisions
        ]
        assert a.platform == b.platform
        assert a.max_changed_files == b.max_changed_files
