"""Azure DevOps adapter — Phase 3.

Resolves PR coordinates from a dev-link URL, then fetches PR + iteration
changes via the ADO REST API. ADO diffs are not as plain as GitHub's
unified-diff payload; we surface changed-file metadata with empty
patches so the model still has the file list, and rely on review thread
comments for risk hints.
"""

from __future__ import annotations

import re
from typing import Optional
from urllib.parse import unquote

import httpx

from .base import AdapterUnavailable, AdoAdapter

try:
    from backend.config.settings import get_settings
    from backend.schemas.context_bundle_models import (
        ChangedFile,
        CodeContext,
        FileDiffChunk,
        ReviewComment,
    )
    from backend.services.ado_service import ADO_BASE, _headers
except ImportError:  # pragma: no cover
    from config.settings import get_settings
    from schemas.context_bundle_models import (
        ChangedFile,
        CodeContext,
        FileDiffChunk,
        ReviewComment,
    )
    from services.ado_service import ADO_BASE, _headers


# Mirrors dev_link_parser._ADO_PR_RE but also captures org separately, which
# the adapter needs. Tolerates trailing slashes, query strings, and percent
# encoding in project/repo segments.
_ADO_PR_RE = re.compile(
    r"(?:dev\.azure\.com|visualstudio\.com)/(?P<org>[^/\s?#]+)/"
    r"(?:(?P<project>[^/\s?#]+)/)?"
    r"_git/(?P<repo>[^/\s?#]+)/pullrequest/(?P<num>\d+)"
    r"(?=$|[/?#\s])",
    re.IGNORECASE,
)


def parse_ado_pr(dev_links: list[str]) -> Optional[tuple[str, str, str, int]]:
    """Returns (org, project, repo, pr_id) when an ADO PR URL is present."""
    for link in dev_links:
        if not link:
            continue
        normalized = unquote(link)
        m = _ADO_PR_RE.search(normalized)
        if m:
            return (
                m.group("org"),
                (m.group("project") or m.group("repo")),
                m.group("repo"),
                int(m.group("num")),
            )
    return None


class AdoRestAdapter(AdoAdapter):
    def __init__(
        self,
        *,
        org: str = "",
        project: str = "",
        repo: str = "",
        pr_id: int = 0,
        token: Optional[str] = None,
    ) -> None:
        self._org = org
        self._project = project
        self._repo = repo
        self._pr_id = pr_id
        self._token = token

    def _effective_token(self) -> tuple[str, str]:
        if self._token:
            return self._token, "pat"
        try:
            from backend.services.auth import identity_service
        except ImportError:  # pragma: no cover
            from services.auth import identity_service
        oauth_token = identity_service.get_oauth_access_token("entra")
        if oauth_token:
            return oauth_token, "oauth"
        return get_settings().ado_access_token, "pat"

    async def health(self) -> bool:
        tok, _ = self._effective_token()
        return bool(tok)

    async def fetch_pr_context(
        self,
        *,
        project: str,
        repo: str,
        pr_id: int,
        max_files: int,
    ) -> CodeContext:
        s = get_settings()
        token, mode = self._effective_token()
        org = self._org or s.ado_org
        if not token or not org:
            raise AdapterUnavailable(
                "ado", "no Azure DevOps token or organization configured"
            )

        proj = project or self._project
        rp = repo or self._repo
        pr = pr_id or self._pr_id
        if not proj or not rp or not pr:
            raise AdapterUnavailable("ado", "missing PR coordinates")

        headers = _headers(token, auth_mode=mode)
        async with httpx.AsyncClient(timeout=12.0) as client:
            try:
                pr_resp = await client.get(
                    f"{ADO_BASE}/{org}/{proj}/_apis/git/repositories/{rp}/pullrequests/{pr}",
                    headers=headers,
                    params={"api-version": "7.1-preview.1"},
                )
                if pr_resp.status_code >= 400:
                    raise AdapterUnavailable(
                        "ado", f"PR fetch returned {pr_resp.status_code}"
                    )
                pr_body = pr_resp.json()

                # Iteration list -> iteration changes (last iteration only)
                iters = await client.get(
                    f"{ADO_BASE}/{org}/{proj}/_apis/git/repositories/{rp}/pullrequests/{pr}/iterations",
                    headers=headers,
                    params={"api-version": "7.1-preview.1"},
                )
                iter_list = iters.json().get("value", []) if iters.status_code < 400 else []
                changes: list[dict] = []
                if iter_list:
                    last = iter_list[-1].get("id")
                    if last:
                        ch = await client.get(
                            f"{ADO_BASE}/{org}/{proj}/_apis/git/repositories/{rp}/pullrequests/{pr}/iterations/{last}/changes",
                            headers=headers,
                            params={"api-version": "7.1-preview.1"},
                        )
                        if ch.status_code < 400:
                            changes = ch.json().get("changeEntries", []) or []

                threads_resp = await client.get(
                    f"{ADO_BASE}/{org}/{proj}/_apis/git/repositories/{rp}/pullrequests/{pr}/threads",
                    headers=headers,
                    params={"api-version": "7.1-preview.1"},
                )
                threads = (
                    threads_resp.json().get("value", [])
                    if threads_resp.status_code < 400
                    else []
                )
            except httpx.HTTPError as exc:
                raise AdapterUnavailable("ado", f"http: {type(exc).__name__}")

        state_map = {"active": "open", "completed": "merged", "abandoned": "closed"}
        state = state_map.get(str(pr_body.get("status", "")), "open")

        changed: list[ChangedFile] = []
        for entry in changes[:max_files]:
            item = entry.get("item") or {}
            path = str(item.get("path") or "")
            if not path:
                continue
            change_type = str(entry.get("changeType") or "").lower()
            changed.append(
                ChangedFile(path=path, status=change_type, additions=0, deletions=0)
            )

        # ADO doesn't expose unified diffs cheaply; surface path metadata only.
        diffs: list[FileDiffChunk] = []

        review_comments: list[ReviewComment] = []
        for th in threads:
            if not isinstance(th, dict):
                continue
            ctx = th.get("threadContext") or {}
            path = str(ctx.get("filePath") or "")
            for c in th.get("comments", []) or []:
                body = str(c.get("content") or "")
                if not body:
                    continue
                author = str((c.get("author") or {}).get("displayName") or "")
                review_comments.append(
                    ReviewComment(
                        author=author,
                        body=body,
                        path=path,
                        line=None,
                        state="comment",
                    )
                )

        review_comments.sort(key=lambda rc: (rc.path, rc.author, rc.body[:40]))
        changed.sort(key=lambda c: c.path)

        return CodeContext(
            platform="ado",
            pr_state=state,  # type: ignore[arg-type]
            pr_title=str(pr_body.get("title", "")),
            pr_description=str(pr_body.get("description", "") or "")[:8000],
            target_branch=str(pr_body.get("targetRefName", "")).replace(
                "refs/heads/", ""
            ),
            commit_messages=[],
            changed_files=changed,
            file_diffs=diffs,
            review_comments=review_comments,
            review_state="",
            build_status={},
        )


AdoAdapterStub = AdoRestAdapter
