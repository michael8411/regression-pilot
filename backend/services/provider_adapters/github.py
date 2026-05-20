"""GitHub adapter — Phase 3.

Fetches PR diff context using the GitHub REST API via httpx + the access
token stored on Settings. Always returns a CodeContext that fits within
the adapter's max_files cap; the prompt budget service trims further if
necessary.
"""

from __future__ import annotations

from typing import Optional

import httpx

from .base import AdapterUnavailable, GithubAdapter

try:
    from backend.config.settings import get_settings
    from backend.schemas.context_bundle_models import (
        ChangedFile,
        CodeContext,
        FileDiffChunk,
        ReviewComment,
    )
    from backend.services.github_service import GITHUB_API, _auth_headers
    from backend.services.dev_link_parser import parse_pr_url
except ImportError:  # pragma: no cover
    from config.settings import get_settings
    from schemas.context_bundle_models import (
        ChangedFile,
        CodeContext,
        FileDiffChunk,
        ReviewComment,
    )
    from services.github_service import GITHUB_API, _auth_headers
    from services.dev_link_parser import parse_pr_url


def parse_github_pr(dev_links: list[str]) -> Optional[tuple[str, str, int]]:
    for link in dev_links:
        if not link:
            continue
        parsed = parse_pr_url(link)
        if parsed["provider"] == "github" and parsed["number"] is not None:
            owner, _, repo = parsed["repository"].partition("/")
            return owner, repo, parsed["number"]
    return None


class GithubRestAdapter(GithubAdapter):
    """Concrete GitHub adapter using the REST API."""

    def __init__(
        self,
        *,
        owner: str = "",
        repo: str = "",
        pr_number: int = 0,
        token: Optional[str] = None,
    ) -> None:
        self._owner = owner
        self._repo = repo
        self._pr_number = pr_number
        self._token = token

    async def health(self) -> bool:
        return bool(self._effective_token())

    def _effective_token(self) -> str:
        if self._token:
            return self._token
        try:
            from backend.services.auth import identity_service
        except ImportError:  # pragma: no cover
            from services.auth import identity_service
        return (
            identity_service.get_oauth_access_token("github")
            or get_settings().github_access_token
        )

    async def fetch_pr_context(
        self,
        *,
        repo_full_name: str,
        pr_number: int,
        max_files: int,
    ) -> CodeContext:
        token = self._effective_token()
        if not token:
            raise AdapterUnavailable("github", "no GitHub access token configured")

        # Caller may have passed explicit args via the routing path; fall back
        # to whatever the adapter was constructed with.
        if repo_full_name and "/" in repo_full_name:
            owner, repo = repo_full_name.split("/", 1)
        else:
            owner, repo = self._owner, self._repo
        number = pr_number or self._pr_number

        if not owner or not repo or not number:
            raise AdapterUnavailable("github", "missing PR coordinates")

        headers = _auth_headers(token)
        async with httpx.AsyncClient(timeout=12.0) as client:
            try:
                pr_resp = await client.get(
                    f"{GITHUB_API}/repos/{owner}/{repo}/pulls/{number}",
                    headers=headers,
                )
                if pr_resp.status_code >= 400:
                    raise AdapterUnavailable(
                        "github", f"PR fetch returned {pr_resp.status_code}"
                    )
                pr = pr_resp.json()

                files_resp = await client.get(
                    f"{GITHUB_API}/repos/{owner}/{repo}/pulls/{number}/files",
                    headers=headers,
                    params={"per_page": min(max_files, 100)},
                )
                files = (
                    files_resp.json()
                    if files_resp.status_code < 400 and isinstance(files_resp.json(), list)
                    else []
                )

                reviews_resp = await client.get(
                    f"{GITHUB_API}/repos/{owner}/{repo}/pulls/{number}/comments",
                    headers=headers,
                    params={"per_page": 50},
                )
                reviews = (
                    reviews_resp.json()
                    if reviews_resp.status_code < 400
                    and isinstance(reviews_resp.json(), list)
                    else []
                )
            except httpx.HTTPError as exc:
                raise AdapterUnavailable("github", f"http: {type(exc).__name__}")

        state = pr.get("state", "open")
        if pr.get("merged"):
            state = "merged"
        elif state not in {"open", "closed", "merged"}:
            state = "open"

        changed = [
            ChangedFile(
                path=str(f.get("filename", "")),
                status=str(f.get("status", "")),
                additions=int(f.get("additions", 0) or 0),
                deletions=int(f.get("deletions", 0) or 0),
            )
            for f in files[:max_files]
            if f.get("filename")
        ]
        diffs = [
            FileDiffChunk(
                path=str(f.get("filename", "")),
                patch=str(f.get("patch", "") or ""),
                truncated=False,
            )
            for f in files[:max_files]
            if f.get("filename") and f.get("patch")
        ]
        review_comments = [
            ReviewComment(
                author=str((rc.get("user") or {}).get("login", "")),
                body=str(rc.get("body", "") or ""),
                path=str(rc.get("path", "") or ""),
                line=rc.get("line") if isinstance(rc.get("line"), int) else None,
                state="comment",
            )
            for rc in reviews
            if rc.get("body")
        ]

        review_comments.sort(key=lambda rc: (rc.path, rc.line or 0, rc.author))
        changed.sort(key=lambda c: c.path)
        diffs.sort(key=lambda d: d.path)

        return CodeContext(
            platform="github",
            pr_state=state,  # type: ignore[arg-type]
            pr_title=str(pr.get("title", "")),
            pr_description=str(pr.get("body", "") or "")[:8000],
            target_branch=str((pr.get("base") or {}).get("ref", "")),
            commit_messages=[],
            changed_files=changed,
            file_diffs=diffs,
            review_comments=review_comments,
            review_state="",
            build_status={},
        )


# Backwards-compatible alias for Phase 1 imports.
GithubAdapterStub = GithubRestAdapter
