"""Shared PR URL parsing for GitHub and ADO dev links.

Single source of truth for PR URL patterns. Both provider adapters and
jira_service import from here to avoid duplicate regexes.

PR URL variants tolerated:
- trailing slashes
- query strings / fragments
- url-encoded path segments (ADO project/repo)
- mixed casing of host names
- visualstudio.com legacy hosts
"""

from __future__ import annotations

import re
from urllib.parse import unquote


# Patterns deliberately stop at `/`, `?`, `#`, whitespace, or end-of-string so
# trailing slashes, query strings, and fragments don't break the parse.
_GITHUB_PR_RE = re.compile(
    r"github\.com/(?P<owner>[^/\s?#]+)/(?P<repo>[^/\s?#]+)/pull/(?P<num>\d+)"
    r"(?=$|[/?#\s])",
    re.IGNORECASE,
)

_ADO_PR_RE = re.compile(
    r"(?:dev\.azure\.com|visualstudio\.com)/(?P<org>[^/\s?#]+)/"
    r"(?:(?P<project>[^/\s?#]+)/)?"
    r"_git/(?P<repo>[^/\s?#]+)/pullrequest/(?P<num>\d+)"
    r"(?=$|[/?#\s])",
    re.IGNORECASE,
)


def parse_pr_url(url: str) -> dict:
    """Parse a PR URL and return provider, repository, and PR number.

    Returns:
        {"provider": "github"|"ado"|"unknown", "repository": str, "number": int|None}

    Percent-encoded segments (e.g. `My%20Project`) match against the encoded
    form and are decoded only when populating the `repository` field for
    human-readable display.
    """
    if not url:
        return {"provider": "unknown", "repository": "", "number": None}

    m = _GITHUB_PR_RE.search(url)
    if m:
        return {
            "provider": "github",
            "repository": f"{unquote(m.group('owner'))}/{unquote(m.group('repo'))}",
            "number": int(m.group("num")),
        }

    m = _ADO_PR_RE.search(url)
    if m:
        project = unquote(m.group("project") or m.group("repo"))
        repo = unquote(m.group("repo"))
        return {
            "provider": "ado",
            "repository": f"{project}/{repo}",
            "number": int(m.group("num")),
        }

    return {"provider": "unknown", "repository": "", "number": None}


def infer_platform_from_links(dev_links: list[str]) -> str:
    """Return 'github', 'ado', or 'none' from the first recognizable PR URL."""
    for link in dev_links or []:
        if not link:
            continue
        parsed = parse_pr_url(link)
        if parsed["provider"] in ("github", "ado"):
            return parsed["provider"]
    return "none"
