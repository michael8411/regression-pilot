"""PR URL parsing — realistic GitHub and Azure DevOps variants."""

from __future__ import annotations

from services.dev_link_parser import parse_pr_url, infer_platform_from_links


class TestGithubVariants:
    def test_basic(self):
        r = parse_pr_url("https://github.com/org/repo/pull/123")
        assert r["provider"] == "github"
        assert r["repository"] == "org/repo"
        assert r["number"] == 123

    def test_trailing_slash(self):
        r = parse_pr_url("https://github.com/org/repo/pull/123/")
        assert r["provider"] == "github"
        assert r["number"] == 123

    def test_query_string(self):
        r = parse_pr_url("https://github.com/org/repo/pull/123?notification_referrer_id=abc")
        assert r["provider"] == "github"
        assert r["number"] == 123

    def test_fragment(self):
        r = parse_pr_url("https://github.com/org/repo/pull/123#issuecomment-456")
        assert r["provider"] == "github"
        assert r["number"] == 123

    def test_files_subpath_still_recognizable(self):
        r = parse_pr_url("https://github.com/org/repo/pull/123/files")
        assert r["provider"] == "github"
        assert r["number"] == 123

    def test_case_insensitive_host(self):
        r = parse_pr_url("HTTPS://GITHUB.COM/Org/Repo/pull/9")
        assert r["provider"] == "github"
        assert r["number"] == 9


class TestAdoVariants:
    def test_dev_azure_full(self):
        r = parse_pr_url(
            "https://dev.azure.com/HCSS/Project/_git/repo/pullrequest/456"
        )
        assert r["provider"] == "ado"
        assert r["repository"] == "Project/repo"
        assert r["number"] == 456

    def test_visualstudio_legacy(self):
        r = parse_pr_url(
            "https://myorg.visualstudio.com/Project/_git/repo/pullrequest/789"
        )
        assert r["provider"] == "ado"
        assert r["number"] == 789

    def test_encoded_project_segment(self):
        r = parse_pr_url(
            "https://dev.azure.com/HCSS/My%20Project/_git/repo/pullrequest/100"
        )
        assert r["provider"] == "ado"
        assert r["number"] == 100
        # Decoded repository keeps the spaces.
        assert "My Project" in r["repository"]

    def test_encoded_repo_segment(self):
        r = parse_pr_url(
            "https://dev.azure.com/HCSS/Project/_git/repo%2Dname/pullrequest/55"
        )
        assert r["provider"] == "ado"
        assert r["number"] == 55

    def test_trailing_slash_and_query(self):
        r = parse_pr_url(
            "https://dev.azure.com/HCSS/Project/_git/repo/pullrequest/77/?view=overview"
        )
        assert r["provider"] == "ado"
        assert r["number"] == 77


class TestUnknown:
    def test_internal_url(self):
        r = parse_pr_url("https://internal.example.com/pr/99")
        assert r["provider"] == "unknown"
        assert r["number"] is None

    def test_empty(self):
        r = parse_pr_url("")
        assert r["provider"] == "unknown"


class TestInferPlatform:
    def test_github_then_ado(self):
        links = [
            "https://internal.example.com/x",
            "https://github.com/o/r/pull/1",
        ]
        assert infer_platform_from_links(links) == "github"

    def test_ado_with_trailing_slash(self):
        links = ["https://dev.azure.com/org/proj/_git/repo/pullrequest/3/"]
        assert infer_platform_from_links(links) == "ado"

    def test_empty(self):
        assert infer_platform_from_links([]) == "none"
