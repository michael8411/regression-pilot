"""Context orchestrator behavior tests (Phase 3)."""

from __future__ import annotations

import asyncio

import pytest

from schemas.context_bundle_models import CodeContext, ExistingTests, TicketContext
from services.context_bundle_service import AdapterSet, ticket_context_from_dict
from services.context_orchestrator import (
    AtlassianContextRequired,
    build_for_ticket,
)
from services.provider_adapters.base import (
    AdapterUnavailable,
    AtlassianAdapter,
    AdoAdapter,
    GithubAdapter,
    SqlServerAdapter,
    ZephyrReadAdapter,
)


FIXTURE = {
    "key": "FM-1432",
    "summary": "Pay adjustment regression",
    "issue_type": "Bug",
    "priority": "Critical",
    "labels": ["PAYROLL", "REGRESSION-CANDIDATE"],
    "components": [{"name": "Backend"}, "Mobile"],
    "description": "Repro: pay adjustment lost on reopen.",
    "acceptance_criteria": "Value persists after reopen.",
    "comments": [],
    "development_links": ["https://github.com/hcss/e360/pull/777"],
}


class _StubAtlassian(AtlassianAdapter):
    def __init__(self, ticket):
        self.ticket = ticket

    async def health(self):
        return True

    async def fetch_ticket(self, ticket_key):
        return ticket_context_from_dict(self.ticket)


class _FailingAtlassian(AtlassianAdapter):
    async def health(self):
        return True

    async def fetch_ticket(self, ticket_key):
        raise AdapterUnavailable("atlassian", "boom")


class _StubGithub(GithubAdapter):
    def __init__(self):
        self.calls = 0

    async def health(self):
        return True

    async def fetch_pr_context(self, *, repo_full_name, pr_number, max_files):
        self.calls += 1
        return CodeContext(
            platform="github",
            pr_title="PR title",
            pr_state="open",
            target_branch="main",
        )


class _FailingGithub(GithubAdapter):
    async def health(self):
        return True

    async def fetch_pr_context(self, *, repo_full_name, pr_number, max_files):
        raise AdapterUnavailable("github", "down")


class _StubAdo(AdoAdapter):
    async def health(self):
        return True

    async def fetch_pr_context(self, *, project, repo, pr_id, max_files):
        return CodeContext(platform="ado", pr_title="ADO PR")


class _StubSql(SqlServerAdapter):
    async def health(self):
        return True

    async def fetch_schema_slice(self, *, tables, include_procs=False):
        raise AdapterUnavailable("sql_server", "no provider")


class _StubZephyr(ZephyrReadAdapter):
    async def health(self):
        return True

    async def list_existing_tests(self, ticket_key):
        return ExistingTests(tests=[])


def _adapters(**over):
    base = {
        "atlassian": _StubAtlassian(FIXTURE),
        "github": _StubGithub(),
        "ado": _StubAdo(),
        "sql_server": _StubSql(),
        "zephyr_read": _StubZephyr(),
    }
    base.update(over)
    return AdapterSet(**base)


class TestOrchestratorHappyPath:
    def test_calls_github_for_github_mapped_pr(self):
        adapters = _adapters()
        bundle = asyncio.run(
            build_for_ticket(
                FIXTURE,
                adapters=adapters,
                platform_mapping={"FM": "github"},
            )
        )
        assert "github" in bundle.tool_trace.providers_called
        assert bundle.code_context.platform == "github"

    def test_records_routing_decisions(self):
        adapters = _adapters()
        bundle = asyncio.run(
            build_for_ticket(
                FIXTURE, adapters=adapters, platform_mapping={"FM": "github"}
            )
        )
        names = {d.provider for d in bundle.tool_trace.routing_decisions}
        assert names == {"atlassian", "github", "ado", "sql_server", "zephyr_read"}

    def test_budget_under_hard_cap(self):
        adapters = _adapters()
        bundle = asyncio.run(
            build_for_ticket(
                FIXTURE, adapters=adapters, platform_mapping={"FM": "github"}
            )
        )
        assert bundle.budget.input_chars <= bundle.budget.hard_cap_chars


class TestOrchestratorFallbacks:
    def test_repo_failure_does_not_abort(self):
        adapters = _adapters(github=_FailingGithub())
        bundle = asyncio.run(
            build_for_ticket(
                FIXTURE,
                adapters=adapters,
                platform_mapping={"FM": "github"},
            )
        )
        codes = {(e.provider, e.code) for e in bundle.tool_trace.errors}
        assert ("github", "unavailable") in codes
        # Generation still succeeded: bundle has a ticket and we got a result.
        assert bundle.ticket.key == "FM-1432"

    def test_sql_failure_does_not_abort(self):
        adapters = _adapters()
        bundle = asyncio.run(
            build_for_ticket(
                FIXTURE,
                adapters=adapters,
                platform_mapping={"FM": "github"},
            )
        )
        # _StubSql always raises AdapterUnavailable; recorded but non-fatal.
        providers_with_error = {e.provider for e in bundle.tool_trace.errors}
        assert "sql_server" in providers_with_error

    def test_atlassian_failure_aborts(self):
        adapters = _adapters(atlassian=_FailingAtlassian())
        with pytest.raises(AtlassianContextRequired):
            asyncio.run(
                build_for_ticket(
                    FIXTURE,
                    adapters=adapters,
                    platform_mapping={"FM": "github"},
                )
            )

    def test_atlassian_failure_not_aborts_when_disabled(self):
        adapters = _adapters(atlassian=_FailingAtlassian())
        # Should not raise; trace contains the error instead.
        bundle = asyncio.run(
            build_for_ticket(
                FIXTURE,
                adapters=adapters,
                platform_mapping={"FM": "github"},
                abort_on_atlassian_failure=False,
            )
        )
        codes = {(e.provider, e.code) for e in bundle.tool_trace.errors}
        assert ("atlassian", "unavailable") in codes
