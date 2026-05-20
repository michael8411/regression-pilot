"""Tests for Jira dev-status enrichment and PR normalization (Phase 15).

Pure-function tests (parse_pr_url, normalization) import only from
services.dev_link_parser which has no keyring dependency. Integration-style
tests for get_development_links use the fake_keyring fixture + deferred
imports so keyring is stubbed before jira_service loads.
"""

from __future__ import annotations

import asyncio

import pytest

from services.dev_link_parser import parse_pr_url, infer_platform_from_links


# ---------------------------------------------------------------------------
# parse_pr_url
# ---------------------------------------------------------------------------


class TestParsePrUrl:
    def test_github_pr(self):
        result = parse_pr_url("https://github.com/HCSS-Dev/example/pull/123")
        assert result["provider"] == "github"
        assert result["repository"] == "HCSS-Dev/example"
        assert result["number"] == 123

    def test_github_pr_case_insensitive(self):
        result = parse_pr_url("https://GitHub.com/org/repo/pull/42")
        assert result["provider"] == "github"

    def test_ado_dev_azure_com(self):
        result = parse_pr_url(
            "https://dev.azure.com/HCSS/Project/_git/repo/pullrequest/456"
        )
        assert result["provider"] == "ado"
        assert result["number"] == 456

    def test_ado_visualstudio_com(self):
        result = parse_pr_url(
            "https://myorg.visualstudio.com/Project/_git/repo/pullrequest/789"
        )
        assert result["provider"] == "ado"
        assert result["number"] == 789

    def test_unknown_url(self):
        result = parse_pr_url("https://example.com/something")
        assert result["provider"] == "unknown"
        assert result["number"] is None

    def test_empty_url(self):
        result = parse_pr_url("")
        assert result["provider"] == "unknown"


class TestInferPlatformFromLinks:
    def test_infers_github(self):
        links = ["https://github.com/org/repo/pull/1"]
        assert infer_platform_from_links(links) == "github"

    def test_infers_ado(self):
        links = ["https://dev.azure.com/org/proj/_git/repo/pullrequest/5"]
        assert infer_platform_from_links(links) == "ado"

    def test_first_recognizable_wins(self):
        links = [
            "https://example.com/not-a-pr",
            "https://github.com/org/repo/pull/10",
        ]
        assert infer_platform_from_links(links) == "github"

    def test_empty_links_returns_none(self):
        assert infer_platform_from_links([]) == "none"

    def test_unrecognized_links_return_none(self):
        assert infer_platform_from_links(["https://example.com"]) == "none"

    def test_skips_empty_strings(self):
        assert infer_platform_from_links(["", "  "]) == "none"


# ---------------------------------------------------------------------------
# _normalize_pr_state and _normalize_dev_status_prs
# These are pure helpers — import jira_service via fake_keyring fixture.
# ---------------------------------------------------------------------------


@pytest.fixture
def jira_svc(fake_keyring):
    """Return jira_service module after keyring is stubbed."""
    import services.jira_service as svc
    return svc


class TestNormalizePrState:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("OPEN", "open"),
            ("open", "open"),
            ("MERGED", "merged"),
            ("completed", "merged"),
            ("ACTIVE", "open"),
            ("DECLINED", "closed"),
            ("ABANDONED", "closed"),
            ("closed", "closed"),
            ("whatever", "unknown"),
            ("", "unknown"),
        ],
    )
    def test_states(self, raw, expected, jira_svc):
        assert jira_svc._normalize_pr_state(raw) == expected


class TestNormalizeDevStatusPrs:
    def _github_detail(self, **overrides):
        pr = {
            "id": "123",
            "title": "Fix ticket sync",
            "url": "https://github.com/HCSS-Dev/example/pull/123",
            "status": "OPEN",
            "repositoryName": "HCSS-Dev/example",
            "lastUpdate": "2026-05-17T10:00:00.000Z",
            **overrides,
        }
        return [{"applicationType": "GitHub", "details": {"pullRequests": [pr]}}]

    def test_extracts_github_pr(self, jira_svc):
        prs = jira_svc._normalize_dev_status_prs(self._github_detail(), "github")
        assert len(prs) == 1
        pr = prs[0]
        assert pr["provider"] == "github"
        assert pr["url"] == "https://github.com/HCSS-Dev/example/pull/123"
        assert pr["title"] == "Fix ticket sync"
        assert pr["state"] == "open"
        assert pr["repository"] == "HCSS-Dev/example"
        assert pr["number"] == 123
        assert pr["source"] == "jira_dev_status"

    def test_extracts_ado_pr(self, jira_svc):
        detail = [
            {
                "applicationType": "azure-devops",
                "details": {
                    "pullRequests": [
                        {
                            "url": "https://dev.azure.com/HCSS/Project/_git/repo/pullrequest/456",
                            "title": "Feature branch",
                            "status": "ACTIVE",
                            "repositoryName": "Project/repo",
                            "lastUpdate": "2026-05-18T08:00:00.000Z",
                        }
                    ]
                },
            }
        ]
        prs = jira_svc._normalize_dev_status_prs(detail, "ado")
        assert len(prs) == 1
        pr = prs[0]
        assert pr["provider"] == "ado"
        assert pr["state"] == "open"
        assert pr["number"] == 456

    def test_skips_pr_without_url(self, jira_svc):
        detail = [
            {
                "applicationType": "GitHub",
                "details": {"pullRequests": [{"title": "No URL here"}]},
            }
        ]
        assert jira_svc._normalize_dev_status_prs(detail, "github") == []

    def test_uses_provider_hint_when_url_unknown(self, jira_svc):
        detail = [
            {
                "applicationType": "GitHub",
                "details": {
                    "pullRequests": [
                        {
                            "url": "https://internal.example.com/pr/99",
                            "title": "Internal PR",
                            "status": "open",
                        }
                    ]
                },
            }
        ]
        prs = jira_svc._normalize_dev_status_prs(detail, "github")
        assert len(prs) == 1
        assert prs[0]["provider"] == "github"

    def test_handles_empty_detail(self, jira_svc):
        assert jira_svc._normalize_dev_status_prs([], "github") == []

    def test_handles_missing_details_key(self, jira_svc):
        detail = [{"applicationType": "GitHub"}]
        assert jira_svc._normalize_dev_status_prs(detail, "github") == []

    def test_scans_displayUrl_field(self, jira_svc):
        detail = [
            {
                "applicationType": "GitHub",
                "details": {
                    "pullRequests": [
                        {
                            "displayUrl": "https://github.com/org/repo/pull/77",
                            "title": "Alt URL field",
                            "status": "OPEN",
                        }
                    ]
                },
            }
        ]
        prs = jira_svc._normalize_dev_status_prs(detail, "github")
        assert len(prs) == 1
        assert prs[0]["number"] == 77


# ---------------------------------------------------------------------------
# get_development_links — monkeypatched httpx._client
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, status_code: int, body: dict):
        self.status_code = status_code
        self.headers: dict = {}
        self._body = body

    def json(self):
        return self._body


class _FakeClient:
    """Minimal async context manager + .get() stand-in for httpx.AsyncClient."""

    def __init__(self, responses: dict[str, "_FakeResponse"]):
        self._responses = responses

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        pass

    async def get(self, url: str, *, params=None, **_):
        params = params or {}
        app_type = params.get("applicationType", "__default__")
        if app_type in self._responses:
            return self._responses[app_type]
        return _FakeResponse(404, {})


def _run(coro):
    return asyncio.run(coro)


_EMPTY = _FakeResponse(200, {"detail": []})


class TestGetDevelopmentLinks:
    """Integration tests for get_development_links with stubbed HTTP."""

    def _patch(self, monkeypatch, jira_svc, responses: dict):
        fake = _FakeClient(responses)

        async def _fake_client():
            return fake

        monkeypatch.setattr(jira_svc, "_client", _fake_client)

    def test_returns_github_pr(self, monkeypatch, jira_svc):
        github_body = {
            "detail": [
                {
                    "applicationType": "GitHub",
                    "details": {
                        "pullRequests": [
                            {
                                "url": "https://github.com/HCSS-Dev/app/pull/101",
                                "title": "Add feature",
                                "status": "OPEN",
                                "repositoryName": "HCSS-Dev/app",
                                "lastUpdate": "2026-05-17T10:00:00.000Z",
                            }
                        ]
                    },
                }
            ]
        }
        self._patch(
            monkeypatch,
            jira_svc,
            {
                "GitHub": _FakeResponse(200, github_body),
                "azure-devops": _EMPTY,
                "com.microsoft.azure-devops": _EMPTY,
            },
        )
        links, prs, error = _run(jira_svc.get_development_links("10001", "APP-1"))

        assert links == ["https://github.com/HCSS-Dev/app/pull/101"]
        assert len(prs) == 1
        assert prs[0]["provider"] == "github"
        assert error == ""

    def test_403_does_not_raise(self, monkeypatch, jira_svc):
        self._patch(
            monkeypatch,
            jira_svc,
            {
                "GitHub": _FakeResponse(403, {}),
                "azure-devops": _FakeResponse(403, {}),
                "com.microsoft.azure-devops": _FakeResponse(403, {}),
            },
        )
        links, prs, error = _run(jira_svc.get_development_links("10002", "APP-2"))

        assert links == []
        assert prs == []
        assert "unauthorized" in error

    def test_500_does_not_raise(self, monkeypatch, jira_svc):
        self._patch(
            monkeypatch,
            jira_svc,
            {
                "GitHub": _FakeResponse(500, {}),
                "azure-devops": _FakeResponse(500, {}),
                "com.microsoft.azure-devops": _FakeResponse(500, {}),
            },
        )
        links, prs, error = _run(jira_svc.get_development_links("10003", "APP-3"))

        assert links == []
        assert "unavailable" in error

    def test_deduplicates_same_url_across_probes(self, monkeypatch, jira_svc):
        dup_body = {
            "detail": [
                {
                    "applicationType": "GitHub",
                    "details": {
                        "pullRequests": [
                            {
                                "url": "https://github.com/org/repo/pull/55",
                                "title": "Dup PR",
                                "status": "OPEN",
                                "repositoryName": "org/repo",
                                "lastUpdate": "2026-05-17T09:00:00.000Z",
                            }
                        ]
                    },
                }
            ]
        }
        dup_resp = _FakeResponse(200, dup_body)
        self._patch(
            monkeypatch,
            jira_svc,
            {
                "GitHub": dup_resp,
                "azure-devops": dup_resp,
                "com.microsoft.azure-devops": dup_resp,
            },
        )
        links, prs, error = _run(jira_svc.get_development_links("10004", "APP-4"))

        assert links.count("https://github.com/org/repo/pull/55") == 1
        assert len(prs) == 1

    def test_open_pr_sorted_before_merged(self, monkeypatch, jira_svc):
        two_pr_body = {
            "detail": [
                {
                    "applicationType": "GitHub",
                    "details": {
                        "pullRequests": [
                            {
                                "url": "https://github.com/org/repo/pull/10",
                                "title": "Old merged",
                                "status": "MERGED",
                                "repositoryName": "org/repo",
                                "lastUpdate": "2026-04-01T10:00:00.000Z",
                            },
                            {
                                "url": "https://github.com/org/repo/pull/20",
                                "title": "Current open",
                                "status": "OPEN",
                                "repositoryName": "org/repo",
                                "lastUpdate": "2026-05-17T10:00:00.000Z",
                            },
                        ]
                    },
                }
            ]
        }
        self._patch(
            monkeypatch,
            jira_svc,
            {
                "GitHub": _FakeResponse(200, two_pr_body),
                "azure-devops": _EMPTY,
                "com.microsoft.azure-devops": _EMPTY,
            },
        )
        links, prs, error = _run(jira_svc.get_development_links("10005", "APP-5"))

        # Open PR must be first (primary).
        assert links[0] == "https://github.com/org/repo/pull/20"
        assert prs[0]["state"] == "open"

    def test_no_prs_returns_empty_no_error(self, monkeypatch, jira_svc):
        self._patch(
            monkeypatch,
            jira_svc,
            {
                "GitHub": _EMPTY,
                "azure-devops": _EMPTY,
                "com.microsoft.azure-devops": _EMPTY,
            },
        )
        links, prs, error = _run(jira_svc.get_development_links("10006", "APP-6"))

        assert links == []
        assert prs == []
        assert error == ""


# ---------------------------------------------------------------------------
# Recursive PR extraction + diagnostics
# ---------------------------------------------------------------------------


class TestRecursiveNormalization:
    def test_finds_pr_in_nested_payload(self, jira_svc):
        # PR-like dict is nested under a non-standard key, not details.pullRequests.
        detail = [
            {
                "applicationType": "GitHub",
                "details": {
                    "branches": [
                        {
                            "name": "feature/x",
                            "associatedPullRequest": {
                                "url": "https://github.com/org/repo/pull/42",
                                "title": "Nested PR",
                                "status": "OPEN",
                                "lastUpdate": "2026-05-01T00:00:00.000Z",
                            },
                        }
                    ]
                },
            }
        ]
        prs = jira_svc._normalize_dev_status_prs(detail, "github")
        assert len(prs) == 1
        assert prs[0]["number"] == 42

    def test_finds_pr_via_string_field_scan(self, jira_svc):
        # Only a plain string field carries the PR URL.
        detail = [
            {
                "applicationType": "GitHub",
                "details": {
                    "items": [
                        {
                            "label": "linked",
                            "href": "https://github.com/org/repo/pull/99",
                            "status": "MERGED",
                        }
                    ]
                },
            }
        ]
        prs = jira_svc._normalize_dev_status_prs(detail, "github")
        assert len(prs) == 1
        assert prs[0]["number"] == 99
        assert prs[0]["state"] == "merged"

    def test_dedup_by_provider_repo_number_when_url_missing(self, jira_svc):
        # Two PRs with same provider/repo/number but no url field — should dedupe.
        prs_in = [
            {"provider": "github", "url": "", "repository": "org/repo", "number": 7, "id": "github:org/repo:7"},
            {"provider": "github", "url": "", "repository": "org/repo", "number": 7, "id": "github:org/repo:7"},
        ]
        unique = jira_svc._dedupe_prs(prs_in)
        assert len(unique) == 1


class TestDiagnostics:
    def _patch(self, monkeypatch, jira_svc, responses: dict):
        fake = _FakeClient(responses)

        async def _fake_client():
            return fake

        monkeypatch.setattr(jira_svc, "_client", _fake_client)

    def test_diagnostics_record_probes_with_status(self, monkeypatch, jira_svc):
        gh_body = {
            "detail": [
                {
                    "applicationType": "GitHub",
                    "details": {
                        "pullRequests": [
                            {
                                "url": "https://github.com/o/r/pull/1",
                                "status": "OPEN",
                                "lastUpdate": "2026-05-17T10:00:00.000Z",
                            }
                        ]
                    },
                }
            ]
        }
        self._patch(
            monkeypatch,
            jira_svc,
            {
                "GitHub": _FakeResponse(200, gh_body),
                "azure-devops": _FakeResponse(403, {}),
                "com.microsoft.azure-devops": _FakeResponse(404, {}),
            },
        )
        result = _run(
            jira_svc.get_development_links_with_diagnostics("123", "APP-1")
        )
        assert result.diagnostics["selected_link_count"] == 1
        assert result.diagnostics["selected_pull_request_count"] == 1
        # All probes recorded.
        statuses = sorted(p["status"] for p in result.diagnostics["probes"])
        assert statuses == [200, 403, 404]
        # PR count only on the successful probe.
        ok_probes = [p for p in result.diagnostics["probes"] if p["ok"]]
        assert len(ok_probes) == 1
        assert ok_probes[0]["pull_request_count"] == 1

    def test_diagnostics_omit_response_bodies(self, monkeypatch, jira_svc):
        body = {
            "detail": [
                {
                    "applicationType": "GitHub",
                    "details": {
                        "pullRequests": [
                            {"url": "https://github.com/o/r/pull/1", "status": "OPEN"}
                        ]
                    },
                }
            ]
        }
        self._patch(
            monkeypatch,
            jira_svc,
            {
                "GitHub": _FakeResponse(200, body),
                "azure-devops": _EMPTY,
                "com.microsoft.azure-devops": _EMPTY,
            },
        )
        result = _run(
            jira_svc.get_development_links_with_diagnostics("123", "APP-1")
        )
        # No probe carries response bodies, headers, or auth.
        for probe in result.diagnostics["probes"]:
            assert "body" not in probe
            assert "headers" not in probe
            assert "authorization" not in probe


class TestConfigurableProbes:
    def test_defaults_when_unconfigured(self, fake_keyring):
        import services.jira_service as svc
        probes = svc._resolve_dev_status_probes()
        types = [t for _, t in probes]
        assert "GitHub" in types
        assert "azure-devops" in types
        assert "com.microsoft.azure-devops" in types

    def test_merges_configured_types(self, fake_keyring):
        # Configure an extra application type via keyring-backed setting.
        fake_keyring.set_password(
            "testdeck",
            "jira_dev_status_application_types",
            "stash,bitbucket",
        )
        from config.settings import get_settings
        get_settings.cache_clear()
        import services.jira_service as svc
        probes = svc._resolve_dev_status_probes()
        types = [t for _, t in probes]
        # Defaults stay first.
        assert types[:3] == ["GitHub", "azure-devops", "com.microsoft.azure-devops"]
        assert "stash" in types
        assert "bitbucket" in types

    def test_ignores_duplicate_configured_default(self, fake_keyring):
        fake_keyring.set_password(
            "testdeck",
            "jira_dev_status_application_types",
            "GitHub, azure-devops",
        )
        from config.settings import get_settings
        get_settings.cache_clear()
        import services.jira_service as svc
        probes = svc._resolve_dev_status_probes()
        # No duplicates.
        types = [t for _, t in probes]
        assert types == ["GitHub", "azure-devops", "com.microsoft.azure-devops"]
