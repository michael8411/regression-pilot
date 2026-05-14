"""Routing playbook validation (Phase 3 / Appendix 5).

These cases are the canonical examples the routing engine must satisfy.
Driven directly from `plans/McpRefactor/mcp-refactor-05-routing-playbook-
and-examples.md`.
"""

from __future__ import annotations

from services.context_routing_service import (
    RoutingPlan,
    TicketSignals,
    build_routing_plan,
)


PLATFORM_MAP = {
    "FM": "github",
    "TEL": "github",
    "HQ": "ado",
    "EQ": "ado",
    "CRW": "ado",
}

ALL_AVAILABLE = ["atlassian", "github", "ado", "sql_server", "zephyr_read"]


def _signals(**kw) -> TicketSignals:
    defaults = dict(
        key="FM-1",
        project_key="FM",
        priority="Medium",
        labels=(),
        components=(),
        development_links=(),
    )
    defaults.update(kw)
    return TicketSignals(**defaults)


def _included(plan: RoutingPlan, provider: str) -> bool:
    for d in plan.decisions:
        if d.provider == provider:
            return d.included
    raise AssertionError(f"missing decision: {provider}")


class TestCaseA_FM1432_CriticalPayrollPR:
    """Critical + REGRESSION-CANDIDATE + PAYROLL + PR -> max depth."""

    def setup_method(self):
        self.plan = build_routing_plan(
            _signals(
                key="FM-1432",
                project_key="FM",
                priority="Critical",
                labels=("PAYROLL", "REGRESSION-CANDIDATE"),
                development_links=("https://github.com/hcss/e360/pull/777",),
            ),
            platform_mapping=PLATFORM_MAP,
            available_providers=ALL_AVAILABLE,
        )

    def test_jira_included(self):
        assert _included(self.plan, "atlassian")

    def test_github_included(self):
        assert _included(self.plan, "github")

    def test_ado_not_included(self):
        assert not _included(self.plan, "ado")

    def test_sql_included(self):
        assert _included(self.plan, "sql_server")

    def test_full_files_allowed(self):
        assert self.plan.include_full_files is True

    def test_zephyr_included(self):
        assert _included(self.plan, "zephyr_read")


class TestCaseB_FM1207_MediumMobilePR:
    """FM + MOBILE/UI + Medium + PR -> jira + github + zephyr_read, no sql."""

    def setup_method(self):
        self.plan = build_routing_plan(
            _signals(
                key="FM-1207",
                project_key="FM",
                priority="Medium",
                labels=("MOBILE", "UI"),
                development_links=("https://github.com/hcss/e360/pull/120",),
            ),
            platform_mapping=PLATFORM_MAP,
            available_providers=ALL_AVAILABLE,
        )

    def test_jira_included(self):
        assert _included(self.plan, "atlassian")

    def test_github_included(self):
        assert _included(self.plan, "github")

    def test_sql_not_included(self):
        assert not _included(self.plan, "sql_server")

    def test_full_files_not_allowed(self):
        assert self.plan.include_full_files is False

    def test_zephyr_included(self):
        assert _included(self.plan, "zephyr_read")


class TestCaseC_HQ892_SyncDatabaseAdoPR:
    """HQ + SYNC/DATABASE/SERVER-SIDE + High + ADO PR -> jira+ado+sql+zephyr, no full file."""

    def setup_method(self):
        self.plan = build_routing_plan(
            _signals(
                key="HQ-892",
                project_key="HQ",
                priority="High",
                labels=("SYNC", "DATABASE", "SERVER-SIDE"),
                development_links=(
                    "https://dev.azure.com/hcss/HeavyJob/_git/heavyjob-desktop/pullrequest/4421",
                ),
            ),
            platform_mapping=PLATFORM_MAP,
            available_providers=ALL_AVAILABLE,
        )

    def test_ado_included(self):
        assert _included(self.plan, "ado")

    def test_github_not_included(self):
        assert not _included(self.plan, "github")

    def test_sql_included(self):
        assert _included(self.plan, "sql_server")

    def test_full_files_not_allowed(self):
        assert self.plan.include_full_files is False

    def test_zephyr_included(self):
        assert _included(self.plan, "zephyr_read")


class TestCaseD_NoPR:
    """No PR -> jira + zephyr_read; sql conditional by labels; no repo."""

    def test_no_repo_when_pr_missing(self):
        plan = build_routing_plan(
            _signals(
                key="FM-7",
                project_key="FM",
                priority="Medium",
                labels=("UI",),
                development_links=(),
            ),
            platform_mapping=PLATFORM_MAP,
            available_providers=ALL_AVAILABLE,
        )
        assert not _included(plan, "github")
        assert not _included(plan, "ado")
        assert _included(plan, "atlassian")
        assert _included(plan, "zephyr_read")

    def test_sql_included_when_label_signals_db(self):
        plan = build_routing_plan(
            _signals(
                key="FM-8",
                project_key="FM",
                priority="Medium",
                labels=("DATABASE",),
                development_links=(),
            ),
            platform_mapping=PLATFORM_MAP,
            available_providers=ALL_AVAILABLE,
        )
        assert _included(plan, "sql_server")
