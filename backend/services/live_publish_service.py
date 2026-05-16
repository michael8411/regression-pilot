"""Phase 06b — publish Live-generated test cases back to a Jira ticket.

The publish service is the single execution path behind
`POST /live/generated-cases/{case_set_id}/publish`. It coordinates:

  * loading the persisted generated case set from `live_artifact_service`,
  * pushing selected cases to Zephyr Scale with issue links to the source
    Jira ticket (primary path — these appear in the ticket's Test Cases
    panel where Zephyr exposes linked tests),
  * falling back to a structured Jira comment when Zephyr is unavailable
    or linked test creation fails and the caller opted in,
  * persisting encrypted export metadata + an `exported_at` timestamp on
    the case set so the UI can render durable status across reloads,
  * truthfully reporting whether the result "appears on the Jira ticket"
    so the UI never falsely promises success.

The service is intentionally tolerant of provider failures: a Zephyr
outage degrades into the comment fallback (or a typed failure when
fallback is off) and never raises an unhandled exception across the
route boundary.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

import structlog

try:
    from backend.schemas.live_models import (
        LiveCreatedTestCase,
        LiveExportMetadata,
        LiveFailedPublishCase,
        LiveGeneratedCasesPatch,
        LiveJiraCommentResult,
        LivePublishCasesRequest,
        LivePublishCasesResponse,
    )
    from backend.services import (
        jira_service,
        live_artifact_service,
        zephyr_service,
    )
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from schemas.live_models import (
        LiveCreatedTestCase,
        LiveExportMetadata,
        LiveFailedPublishCase,
        LiveGeneratedCasesPatch,
        LiveJiraCommentResult,
        LivePublishCasesRequest,
        LivePublishCasesResponse,
    )
    from services import (
        jira_service,
        live_artifact_service,
        zephyr_service,
    )


logger = structlog.get_logger("testdeck.live_publish")


class PublishError(Exception):
    """Raised for typed validation failures (bad ids, missing cases, etc.)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Helpers — input shaping + persistence
# ---------------------------------------------------------------------------


def _resolve_indexes(
    cases: list[Any], requested: Optional[list[int]]
) -> list[int]:
    if not requested:
        return list(range(len(cases)))
    seen: set[int] = set()
    resolved: list[int] = []
    for idx in requested:
        if not isinstance(idx, int):
            raise PublishError("invalid_case_index", f"Invalid case index: {idx!r}")
        if idx < 0 or idx >= len(cases):
            raise PublishError(
                "invalid_case_index",
                f"Case index {idx} is out of range (set has {len(cases)} cases)",
            )
        if idx in seen:
            continue
        seen.add(idx)
        resolved.append(idx)
    if not resolved:
        raise PublishError(
            "no_cases_selected",
            "At least one case must be selected for publishing.",
        )
    return resolved


def _coerce_case(case: Any) -> dict:
    if isinstance(case, dict):
        return case
    return {"name": str(case)}


def _to_created_model(created_raw: dict) -> LiveCreatedTestCase:
    return LiveCreatedTestCase(
        name=str(
            created_raw.get("name")
            or created_raw.get("key")
            or created_raw.get("id")
            or "Untitled"
        ),
        key=created_raw.get("key"),
        id=str(created_raw["id"]) if created_raw.get("id") is not None else None,
        self_url=created_raw.get("self") or created_raw.get("selfLink"),
    )


def _to_failed_model(failed_raw: dict) -> LiveFailedPublishCase:
    return LiveFailedPublishCase(
        name=str(failed_raw.get("name") or "Untitled"),
        error=str(failed_raw.get("error") or "Unknown error"),
    )


def _format_comment_body(
    *,
    ticket_key: str,
    cases: list[dict],
    set_id: str,
) -> str:
    """Build the structured Jira comment fallback body.

    Plaintext is fine here — the Jira API call already trusts the customer's
    Jira instance with this content; nothing extra is leaked relative to
    what they would paste manually.
    """
    lines: list[str] = []
    lines.append("Testdeck generated test cases")
    lines.append("")
    lines.append(
        "These cases were posted as a Jira comment because linked test-case "
        "publishing was unavailable. They may not appear in the Jira "
        "Test Cases panel."
    )
    lines.append("")
    lines.append(f"Source ticket: {ticket_key}")
    lines.append(f"Source generated case set: {set_id}")
    lines.append("")
    for i, tc in enumerate(cases, start=1):
        lines.append(f"--- Case {i}: {tc.get('name', 'Untitled')} ---")
        if tc.get("priority"):
            lines.append(f"Priority: {tc['priority']}")
        if tc.get("objective"):
            lines.append(f"Objective: {tc['objective']}")
        precs = tc.get("preconditions")
        if precs:
            if isinstance(precs, list):
                lines.append("Preconditions:")
                for p in precs:
                    lines.append(f"  - {p}")
            else:
                lines.append(f"Preconditions: {precs}")
        steps = tc.get("steps") or []
        if steps:
            lines.append("Steps:")
            for j, step in enumerate(steps, start=1):
                if isinstance(step, dict):
                    action = step.get("action") or step.get("description") or ""
                    expected = step.get("expected_result") or step.get(
                        "expectedResult"
                    ) or ""
                    lines.append(f"  {j}. {action}")
                    if expected:
                        lines.append(f"     Expected: {expected}")
                else:
                    lines.append(f"  {j}. {step}")
        expected_top = tc.get("expected_result") or tc.get("expectedResult")
        if expected_top:
            lines.append(f"Expected result: {expected_top}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


async def _persist_export(
    *,
    case_set_id: str,
    status: str,
    export_metadata: LiveExportMetadata,
    exported_at: Optional[str],
) -> None:
    patch = LiveGeneratedCasesPatch(
        status=status,  # type: ignore[arg-type]
        export_metadata=export_metadata.model_dump(),
        exported_at=exported_at,
    )
    await live_artifact_service.patch_generated_cases(case_set_id, patch)


# ---------------------------------------------------------------------------
# Core publish entry point
# ---------------------------------------------------------------------------


async def publish_generated_cases(
    case_set_id: str, request: LivePublishCasesRequest
) -> LivePublishCasesResponse:
    """Execute a publish attempt for a stored generated case set.

    Raises:
        PublishError: for typed validation failures (404-like cases,
            invalid case indexes, no selection). The route layer maps these
            to HTTP 4xx responses.
    """

    # ---- Load + validate ---------------------------------------------------

    case_set = await live_artifact_service.get_generated_cases(case_set_id)
    if case_set is None:
        raise PublishError(
            "case_set_not_found",
            f"Generated case set {case_set_id} was not found.",
        )

    ticket_key = (request.ticket_key or "").strip()
    project_key = (request.project_key or "").strip()
    if not ticket_key:
        raise PublishError("missing_ticket_key", "ticket_key is required.")
    if not project_key:
        raise PublishError("missing_project_key", "project_key is required.")

    raw_cases = list(case_set.cases or [])
    if not raw_cases:
        raise PublishError(
            "no_cases_in_set", "The generated case set has no cases."
        )

    indexes = _resolve_indexes(raw_cases, request.case_indexes)
    selected = [_coerce_case(raw_cases[i]) for i in indexes]
    if not selected:
        raise PublishError(
            "no_cases_selected",
            "At least one case must be selected for publishing.",
        )

    duplicate_attempt = bool(
        case_set.exported_at
        or case_set.status in {"exported", "partial_export", "commented"}
    )
    if duplicate_attempt and not request.confirm_duplicate:
        raise PublishError(
            "duplicate_publish_unconfirmed",
            "This case set was already published. Re-publishing requires "
            "confirm_duplicate=true.",
        )

    now = _now_iso()
    logger.info(
        "live_publish_started",
        case_set_id=case_set_id,
        ticket_key=ticket_key,
        mode=request.mode,
        case_count=len(selected),
        duplicate_attempt=duplicate_attempt,
    )

    # ---- Branch on mode ----------------------------------------------------

    if request.mode == "jira_comment":
        # Customer explicitly chose the comment path; skip Zephyr entirely.
        return await _publish_via_comment(
            case_set_id=case_set_id,
            ticket_key=ticket_key,
            project_key=project_key,
            selected=selected,
            indexes=indexes,
            duplicate_attempt=duplicate_attempt,
            now=now,
        )

    # ---- Primary path: Zephyr linked test cases ----------------------------

    try:
        bulk = await zephyr_service.create_test_cases_bulk(
            project_key=project_key,
            test_cases=selected,
            folder_id=request.folder_id,
            issue_links=[ticket_key],
        )
    except Exception as exc:
        logger.warning(
            "live_publish_zephyr_bulk_failed",
            case_set_id=case_set_id,
            error=str(exc)[:200],
        )
        if request.fallback_to_comment:
            return await _publish_via_comment(
                case_set_id=case_set_id,
                ticket_key=ticket_key,
                project_key=project_key,
                selected=selected,
                indexes=indexes,
                duplicate_attempt=duplicate_attempt,
                now=now,
                fallback_reason=str(exc)[:200],
            )
        # Total failure, no fallback allowed.
        return await _record_total_failure(
            case_set_id=case_set_id,
            ticket_key=ticket_key,
            project_key=project_key,
            indexes=indexes,
            selected_names=[c.get("name", "Untitled") for c in selected],
            error=str(exc)[:200],
            duplicate_attempt=duplicate_attempt,
            now=now,
        )

    created_raw: list[dict] = list(bulk.get("created", []))
    failed_raw: list[dict] = list(bulk.get("failed", []))

    # Cases that link-failed but still created are reported as failed for
    # the "appears on ticket" contract — even though Zephyr has the case,
    # it will not show up in the Jira ticket's Test Cases panel.
    link_failed = [f for f in failed_raw if f.get("issue_link_failed")]

    created_models = [_to_created_model(c) for c in created_raw]
    failed_models = [_to_failed_model(f) for f in failed_raw]

    created_count = len(created_models)
    failed_count = len(failed_models)

    if created_count > 0 and failed_count == 0:
        status = "exported"
        appears_on_ticket = True
        message = None
    elif created_count > 0 and failed_count > 0:
        status = "partial_export"
        appears_on_ticket = not link_failed and created_count > 0
        message = (
            "Some cases were created in Zephyr but at least one failed; "
            "review the failed list before retrying."
        )
    else:
        # Nothing created — try fallback if allowed.
        if request.fallback_to_comment:
            return await _publish_via_comment(
                case_set_id=case_set_id,
                ticket_key=ticket_key,
                project_key=project_key,
                selected=selected,
                indexes=indexes,
                duplicate_attempt=duplicate_attempt,
                now=now,
                fallback_reason="All Zephyr cases failed",
                prior_failed=failed_models,
            )
        return await _record_total_failure(
            case_set_id=case_set_id,
            ticket_key=ticket_key,
            project_key=project_key,
            indexes=indexes,
            selected_names=[c.get("name", "Untitled") for c in selected],
            error="All Zephyr cases failed",
            duplicate_attempt=duplicate_attempt,
            failed_models=failed_models,
            now=now,
        )

    metadata = LiveExportMetadata(
        target="zephyr_linked_tests",
        source_ticket_key=ticket_key,
        project_key=project_key,
        selected_case_indexes=indexes,
        created_test_cases=created_models,
        failed=failed_models,
        jira_comment=None,
        appears_on_jira_ticket=appears_on_ticket,
        published_at=now,
        duplicate_attempt=duplicate_attempt,
    )
    await _persist_export(
        case_set_id=case_set_id,
        status=status,
        export_metadata=metadata,
        exported_at=now,
    )

    logger.info(
        "live_publish_zephyr_completed",
        case_set_id=case_set_id,
        ticket_key=ticket_key,
        status=status,
        created=created_count,
        failed=failed_count,
        appears_on_jira_ticket=appears_on_ticket,
    )

    return LivePublishCasesResponse(
        status=status,  # type: ignore[arg-type]
        target="zephyr_linked_tests",
        created=created_count,
        created_test_cases=created_models,
        failed=failed_models,
        jira_comment=None,
        appears_on_jira_ticket=appears_on_ticket,
        duplicate_attempt=duplicate_attempt,
        message=message,
        exported_at=now,
    )


# ---------------------------------------------------------------------------
# Helpers — comment fallback + total-failure paths
# ---------------------------------------------------------------------------


async def _publish_via_comment(
    *,
    case_set_id: str,
    ticket_key: str,
    project_key: str,
    selected: list[dict],
    indexes: list[int],
    duplicate_attempt: bool,
    now: str,
    fallback_reason: Optional[str] = None,
    prior_failed: Optional[list[LiveFailedPublishCase]] = None,
) -> LivePublishCasesResponse:
    body = _format_comment_body(
        ticket_key=ticket_key, cases=selected, set_id=case_set_id
    )
    try:
        comment = await jira_service.post_comment(ticket_key, body)
    except Exception as exc:
        logger.warning(
            "live_publish_jira_comment_failed",
            case_set_id=case_set_id,
            ticket_key=ticket_key,
            error=str(exc)[:200],
        )
        return await _record_total_failure(
            case_set_id=case_set_id,
            ticket_key=ticket_key,
            project_key=project_key,
            indexes=indexes,
            selected_names=[c.get("name", "Untitled") for c in selected],
            error=f"Jira comment failed: {str(exc)[:160]}",
            duplicate_attempt=duplicate_attempt,
            failed_models=prior_failed,
            now=now,
        )

    comment_model = LiveJiraCommentResult(
        id=str(comment.get("id", "")),
        ticket_key=ticket_key,
        author=comment.get("author"),
        created=comment.get("created"),
        url=comment.get("url") or comment.get("self") or None,
    )

    failed_models = list(prior_failed or [])

    metadata = LiveExportMetadata(
        target="jira_comment",
        source_ticket_key=ticket_key,
        project_key=project_key,
        selected_case_indexes=indexes,
        created_test_cases=[],
        failed=failed_models,
        jira_comment=comment_model,
        appears_on_jira_ticket=False,
        published_at=now,
        duplicate_attempt=duplicate_attempt,
    )
    await _persist_export(
        case_set_id=case_set_id,
        status="commented",
        export_metadata=metadata,
        exported_at=now,
    )

    logger.info(
        "live_publish_comment_completed",
        case_set_id=case_set_id,
        ticket_key=ticket_key,
        comment_id=comment_model.id,
        fallback=bool(fallback_reason),
    )

    return LivePublishCasesResponse(
        status="commented",
        target="jira_comment",
        created=0,
        created_test_cases=[],
        failed=failed_models,
        jira_comment=comment_model,
        appears_on_jira_ticket=False,
        duplicate_attempt=duplicate_attempt,
        message=(
            "Posted as a Jira comment. The cases may not appear in the "
            "Jira Test Cases panel."
        ),
        exported_at=now,
    )


async def _record_total_failure(
    *,
    case_set_id: str,
    ticket_key: str,
    project_key: str,
    indexes: list[int],
    selected_names: list[str],
    error: str,
    duplicate_attempt: bool,
    now: str,
    failed_models: Optional[list[LiveFailedPublishCase]] = None,
) -> LivePublishCasesResponse:
    """Return a typed failure response without flipping status away from draft.

    Failures must not destroy the user's draft. The case set keeps its
    existing status; only export_metadata is updated so the UI can render
    a "publish failed" hint and the customer can retry.
    """
    if failed_models is None:
        failed_models = [
            LiveFailedPublishCase(name=name, error=error)
            for name in selected_names
        ]
    metadata = LiveExportMetadata(
        target="none",
        source_ticket_key=ticket_key,
        project_key=project_key,
        selected_case_indexes=indexes,
        created_test_cases=[],
        failed=failed_models,
        jira_comment=None,
        appears_on_jira_ticket=False,
        published_at=now,
        duplicate_attempt=duplicate_attempt,
    )
    # Preserve the existing status (typically 'draft'); only record metadata.
    patch = LiveGeneratedCasesPatch(
        export_metadata=metadata.model_dump(),
    )
    await live_artifact_service.patch_generated_cases(case_set_id, patch)
    logger.info(
        "live_publish_total_failure",
        case_set_id=case_set_id,
        ticket_key=ticket_key,
        error=error[:200],
    )
    return LivePublishCasesResponse(
        status="draft",
        target="none",
        created=0,
        created_test_cases=[],
        failed=failed_models,
        jira_comment=None,
        appears_on_jira_ticket=False,
        duplicate_attempt=duplicate_attempt,
        message=error,
        exported_at=None,
    )
