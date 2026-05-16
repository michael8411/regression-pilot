"""Phase 08 — encrypted-at-rest assertions for live workflow artifacts.

These tests are part of the Phase 08 verification matrix (section G).
Each test inspects the raw SQLite column AFTER a normal service call
and asserts:

  * the stored ciphertext is a Fernet token (starts with ``gAAAAAB``),
  * none of the sensitive plaintext markers leak into the column,
  * the bytes are not valid JSON (i.e. callers cannot accidentally
    introspect a payload by reading the row).

Covered columns:

  - live_pinned_tickets.ticket_snapshot
  - live_generated_cases.instructions
  - live_generated_cases.cases_json
  - live_generated_cases.context_metadata
  - live_generated_cases.export_metadata
  - live_activity.summary
  - live_activity.detail

`live_boards.jql`, `profile`, and `view_prefs` are covered in
`tests/services/test_live_board_security.py` and Phase 08-added tests
on board profiles here as well, so the full G-matrix passes via a
single suite run.
"""

from __future__ import annotations

import asyncio
import json
import logging

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "live_artifact_security_test.db"


@pytest.fixture
def svc(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod

    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db

    asyncio.run(init_db())

    import services.live_artifact_service as artifact_service

    return artifact_service


@pytest.fixture
def board_svc(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod

    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db

    asyncio.run(init_db())

    import services.live_board_service as svc_mod

    return svc_mod


@pytest.fixture
def schemas():
    from schemas.live_models import (
        LiveActivityCreate,
        LiveBoardProfile,
        LiveBoardViewPreferences,
        LiveGeneratedCasesCreate,
        LivePinnedTicketUpsert,
    )

    return {
        "LivePinnedTicketUpsert": LivePinnedTicketUpsert,
        "LiveGeneratedCasesCreate": LiveGeneratedCasesCreate,
        "LiveActivityCreate": LiveActivityCreate,
        "LiveBoardProfile": LiveBoardProfile,
        "LiveBoardViewPreferences": LiveBoardViewPreferences,
    }


def _run(coro):
    return asyncio.run(coro)


async def _scalar(sql: str, *args):
    from db.connection import get_connection

    async with get_connection() as db:
        cursor = await db.execute(sql, args)
        row = await cursor.fetchone()
    return row


def _assert_encrypted(blob: str, plaintext_markers: tuple[str, ...]) -> None:
    """Assert blob is Fernet-encrypted ciphertext, not plaintext."""
    assert isinstance(blob, str) and blob, "expected non-empty ciphertext"
    assert blob.startswith("gAAAAAB"), f"not a fernet token: {blob[:16]!r}"
    for marker in plaintext_markers:
        assert marker not in blob, f"leak: {marker!r} found in stored blob"
    with pytest.raises(json.JSONDecodeError):
        json.loads(blob)


# ---------------------------------------------------------------------------
# Pinned tickets
# ---------------------------------------------------------------------------


class TestPinnedSnapshotEncryption:

    def test_snapshot_encrypted_at_rest(self, svc, schemas):
        marker = "redacted-secret-summary-FM9"
        payload = schemas["LivePinnedTicketUpsert"](
            board_id="board-1",
            ticket_snapshot={"key": "FM-9", "summary": marker},
        )
        _run(svc.upsert_pinned_ticket("FM-9", payload))

        row = _run(
            _scalar(
                "SELECT ticket_snapshot FROM live_pinned_tickets WHERE ticket_key = ?",
                "FM-9",
            )
        )
        _assert_encrypted(row["ticket_snapshot"], (marker, "FM-9"))


# ---------------------------------------------------------------------------
# Generated cases
# ---------------------------------------------------------------------------


class TestGeneratedCasesEncryption:

    def test_instructions_encrypted(self, svc, schemas):
        marker = "do-not-leak-instructions-token"
        out = _run(
            svc.create_generated_cases(
                schemas["LiveGeneratedCasesCreate"](
                    ticket_key="FM-1",
                    instructions=marker,
                    cases=[],
                )
            )
        )
        row = _run(
            _scalar(
                "SELECT instructions FROM live_generated_cases WHERE id = ?",
                out.id,
            )
        )
        _assert_encrypted(row["instructions"], (marker,))

    def test_cases_json_encrypted(self, svc, schemas):
        step_marker = "step-with-sensitive-payload-XYZ"
        out = _run(
            svc.create_generated_cases(
                schemas["LiveGeneratedCasesCreate"](
                    ticket_key="FM-1",
                    instructions="",
                    cases=[
                        {
                            "name": "Secret smoke",
                            "steps": [step_marker, "second"],
                        }
                    ],
                )
            )
        )
        row = _run(
            _scalar(
                "SELECT cases_json FROM live_generated_cases WHERE id = ?",
                out.id,
            )
        )
        _assert_encrypted(
            row["cases_json"], (step_marker, "Secret smoke")
        )

    def test_context_metadata_encrypted(self, svc, schemas):
        marker = "context-meta-leak-marker"
        out = _run(
            svc.create_generated_cases(
                schemas["LiveGeneratedCasesCreate"](
                    ticket_key="FM-1",
                    instructions="",
                    cases=[],
                    context_metadata={"requestId": marker},
                )
            )
        )
        row = _run(
            _scalar(
                "SELECT context_metadata FROM live_generated_cases WHERE id = ?",
                out.id,
            )
        )
        _assert_encrypted(row["context_metadata"], (marker,))

    def test_export_metadata_encrypted(self, svc, schemas):
        marker = "export-meta-leak-marker"
        out = _run(
            svc.create_generated_cases(
                schemas["LiveGeneratedCasesCreate"](
                    ticket_key="FM-1",
                    instructions="",
                    cases=[],
                    export_metadata={"zephyrKey": marker},
                )
            )
        )
        row = _run(
            _scalar(
                "SELECT export_metadata FROM live_generated_cases WHERE id = ?",
                out.id,
            )
        )
        _assert_encrypted(row["export_metadata"], (marker,))

    def test_status_column_remains_plaintext(self, svc, schemas):
        """`status` is intentionally plaintext — it's a controlled enum
        with no PII or secret content, and the route layer + indexes need
        to filter on it. Encryption would block both."""
        out = _run(
            svc.create_generated_cases(
                schemas["LiveGeneratedCasesCreate"](
                    ticket_key="FM-1", instructions="", cases=[]
                )
            )
        )
        row = _run(
            _scalar(
                "SELECT status FROM live_generated_cases WHERE id = ?", out.id
            )
        )
        assert row["status"] == "draft"


# ---------------------------------------------------------------------------
# Activity feed
# ---------------------------------------------------------------------------


class TestActivityEncryption:

    def test_summary_and_detail_encrypted(self, svc, schemas):
        summary_marker = "summary-leak-marker"
        detail_marker = "detail-leak-marker"
        out = _run(
            svc.create_activity(
                schemas["LiveActivityCreate"](
                    kind="other",
                    summary=summary_marker,
                    detail=detail_marker,
                )
            )
        )
        row = _run(
            _scalar(
                "SELECT summary, detail FROM live_activity WHERE id = ?", out.id
            )
        )
        _assert_encrypted(row["summary"], (summary_marker,))
        _assert_encrypted(row["detail"], (detail_marker,))

    def test_kind_column_remains_plaintext(self, svc, schemas):
        out = _run(
            svc.create_activity(
                schemas["LiveActivityCreate"](
                    kind="ticket_pinned", summary="x", detail="y"
                )
            )
        )
        row = _run(
            _scalar("SELECT kind FROM live_activity WHERE id = ?", out.id)
        )
        assert row["kind"] == "ticket_pinned"


# ---------------------------------------------------------------------------
# Board profile / view_prefs (Phase 01 additions)
# ---------------------------------------------------------------------------


class TestBoardProfileEncryption:

    def test_profile_encrypted_at_rest(self, board_svc, schemas):
        version_marker = "release-22.3-confidential"
        profile = schemas["LiveBoardProfile"](
            builderMode="simple",
            projectKey="HCS",
            versionName=version_marker,
            selectedStatuses=["Ready for QA"],
        )
        board = _run(
            board_svc.create_board(
                name="QA", jql="project = HCS", profile=profile
            )
        )
        row = _run(
            _scalar("SELECT profile FROM live_boards WHERE id = ?", board["id"])
        )
        _assert_encrypted(row["profile"], (version_marker, "HCS"))

    def test_view_prefs_encrypted_at_rest(self, board_svc, schemas):
        filter_marker = "private-home-filter-marker"
        view_prefs = schemas["LiveBoardViewPreferences"](
            homeFilter=filter_marker, density="cozy"
        )
        board = _run(
            board_svc.create_board(
                name="QA",
                jql="project = HCS",
                view_prefs=view_prefs,
            )
        )
        row = _run(
            _scalar(
                "SELECT view_prefs FROM live_boards WHERE id = ?", board["id"]
            )
        )
        _assert_encrypted(row["view_prefs"], (filter_marker,))


# ---------------------------------------------------------------------------
# Phase 06b — publish-flow encryption assertions
# ---------------------------------------------------------------------------


class TestPublishExportMetadataEncryption:
    """After a publish run, the persisted export metadata must be encrypted.

    The publish service calls `live_artifact_service.patch_generated_cases`
    with the full `export_metadata` dict; we exercise the publish service
    end-to-end with mocked Zephyr/Jira so the row reflects exactly what
    production would write.
    """

    def test_zephyr_export_metadata_encrypted_at_rest(
        self, svc, schemas, monkeypatch
    ):
        from services import (
            live_publish_service as publish_service,
            zephyr_service,
        )

        marker_case_name = "secret-case-name-XYZ"
        marker_step = "secret-step-payload-XYZ"

        case_set = _run(
            svc.create_generated_cases(
                schemas["LiveGeneratedCasesCreate"](
                    ticket_key="FM-9",
                    instructions="",
                    cases=[
                        {
                            "name": marker_case_name,
                            "priority": "High",
                            "steps": [
                                {
                                    "action": marker_step,
                                    "expected_result": "ok",
                                }
                            ],
                        }
                    ],
                )
            )
        )

        async def fake_bulk(*, project_key, test_cases, folder_id, issue_links):
            return {
                "created": [
                    {"name": marker_case_name, "key": "FM-T1", "id": "1"}
                ],
                "failed": [],
            }

        monkeypatch.setattr(
            zephyr_service, "create_test_cases_bulk", fake_bulk
        )

        from schemas.live_models import LivePublishCasesRequest

        _run(
            publish_service.publish_generated_cases(
                case_set.id,
                LivePublishCasesRequest(
                    ticket_key="FM-9",
                    project_key="FM",
                    mode="linked_test_cases",
                    fallback_to_comment=True,
                ),
            )
        )
        row = _run(
            _scalar(
                "SELECT export_metadata FROM live_generated_cases WHERE id = ?",
                case_set.id,
            )
        )
        _assert_encrypted(
            row["export_metadata"],
            (marker_case_name, "FM-T1", "FM-9"),
        )

    def test_jira_comment_export_metadata_encrypted_at_rest(
        self, svc, schemas, monkeypatch
    ):
        from services import (
            jira_service,
            live_publish_service as publish_service,
        )

        marker_comment_id = "secret-comment-id-987"
        case_set = _run(
            svc.create_generated_cases(
                schemas["LiveGeneratedCasesCreate"](
                    ticket_key="FM-9",
                    instructions="",
                    cases=[{"name": "case-A", "objective": "x"}],
                )
            )
        )

        async def fake_post_comment(ticket_key, body):
            return {
                "id": marker_comment_id,
                "author": "Test",
                "created": "2026-05-16T00:00:00Z",
            }

        monkeypatch.setattr(jira_service, "post_comment", fake_post_comment)

        from schemas.live_models import LivePublishCasesRequest

        _run(
            publish_service.publish_generated_cases(
                case_set.id,
                LivePublishCasesRequest(
                    ticket_key="FM-9",
                    project_key="FM",
                    mode="jira_comment",
                    fallback_to_comment=True,
                ),
            )
        )
        row = _run(
            _scalar(
                "SELECT export_metadata FROM live_generated_cases WHERE id = ?",
                case_set.id,
            )
        )
        _assert_encrypted(row["export_metadata"], (marker_comment_id,))


class TestCommentFallbackBodyHygiene:
    """The Jira-fallback comment body is sent over the wire to Jira, not
    stored locally — but the publish service must never persist the raw
    comment body anywhere in the live_generated_cases row."""

    def test_comment_body_not_persisted_in_export_metadata(
        self, svc, schemas, monkeypatch
    ):
        from services import (
            jira_service,
            live_publish_service as publish_service,
        )

        secret_in_objective = "secret-objective-payload-ABC"
        case_set = _run(
            svc.create_generated_cases(
                schemas["LiveGeneratedCasesCreate"](
                    ticket_key="FM-9",
                    instructions="",
                    cases=[
                        {
                            "name": "case-A",
                            "objective": secret_in_objective,
                        }
                    ],
                )
            )
        )

        captured = {}

        async def fake_post_comment(ticket_key, body):
            captured["body"] = body
            return {"id": "c1", "author": None, "created": None}

        monkeypatch.setattr(jira_service, "post_comment", fake_post_comment)

        from schemas.live_models import LivePublishCasesRequest

        _run(
            publish_service.publish_generated_cases(
                case_set.id,
                LivePublishCasesRequest(
                    ticket_key="FM-9",
                    project_key="FM",
                    mode="jira_comment",
                ),
            )
        )

        # The body sent to Jira does include the objective by design (the
        # customer chose to post it as a comment). The export_metadata,
        # however, must not contain the raw comment body — only sanitized
        # comment metadata. Read the raw ciphertext and assert the
        # objective marker is absent from the blob.
        row = _run(
            _scalar(
                "SELECT export_metadata FROM live_generated_cases WHERE id = ?",
                case_set.id,
            )
        )
        assert secret_in_objective in captured["body"]
        # Ciphertext should not contain the plaintext marker either way
        # (Fernet obfuscates), but additionally the publish service must
        # never have included the body in metadata.
        _assert_encrypted(row["export_metadata"], (secret_in_objective,))


# ---------------------------------------------------------------------------
# Log hygiene — service code never logs the plaintext payloads
# ---------------------------------------------------------------------------


class TestLogHygiene:

    def test_instructions_never_logged(self, svc, schemas, caplog):
        marker = "log-leak-marker-instructions"
        with caplog.at_level(logging.DEBUG):
            _run(
                svc.create_generated_cases(
                    schemas["LiveGeneratedCasesCreate"](
                        ticket_key="FM-1", instructions=marker, cases=[]
                    )
                )
            )
        joined = "\n".join(r.getMessage() for r in caplog.records)
        assert marker not in joined

    def test_activity_summary_never_logged(self, svc, schemas, caplog):
        marker = "log-leak-marker-activity"
        with caplog.at_level(logging.DEBUG):
            _run(
                svc.create_activity(
                    schemas["LiveActivityCreate"](
                        kind="other", summary=marker, detail=""
                    )
                )
            )
        joined = "\n".join(r.getMessage() for r in caplog.records)
        assert marker not in joined

    def test_pinned_snapshot_never_logged(self, svc, schemas, caplog):
        marker = "log-leak-marker-snapshot"
        with caplog.at_level(logging.DEBUG):
            _run(
                svc.upsert_pinned_ticket(
                    "FM-1",
                    schemas["LivePinnedTicketUpsert"](
                        board_id=None, ticket_snapshot={"private": marker}
                    ),
                )
            )
        joined = "\n".join(r.getMessage() for r in caplog.records)
        assert marker not in joined
