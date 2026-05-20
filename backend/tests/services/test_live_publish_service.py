"""Phase 06b — service-level coverage for `live_publish_service`.

Each test stubs `zephyr_service.create_test_cases_bulk` and
`jira_service.post_comment` directly so the publish service is exercised
in isolation. Persistence runs against a real encrypted SQLite database
via `live_artifact_service` so the export-metadata + status patches the
service performs are observed exactly as production would store them.
"""

from __future__ import annotations

import asyncio
import json

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "live_publish_service_test.db"


@pytest.fixture
def publish_env(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod

    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db

    asyncio.run(init_db())

    import services.live_publish_service as publish_service
    import services.live_artifact_service as artifact_service
    import services.zephyr_service as zephyr_service
    import services.jira_service as jira_service

    from schemas.live_models import (
        LiveGeneratedCasesCreate,
        LivePublishCasesRequest,
    )

    return {
        "publish": publish_service,
        "artifacts": artifact_service,
        "zephyr": zephyr_service,
        "jira": jira_service,
        "LivePublishCasesRequest": LivePublishCasesRequest,
        "LiveGeneratedCasesCreate": LiveGeneratedCasesCreate,
        "monkeypatch": monkeypatch,
    }


def _run(coro):
    return asyncio.run(coro)


def _seed_case_set(env, *, cases=None, ticket_key="FM-9", status="draft"):
    if cases is None:
        cases = [
        {
            "name": "Happy path",
            "priority": "High",
            "objective": "covers main flow",
            "steps": [
                {"action": "open page", "expected_result": "page renders"}
            ],
        },
        {
            "name": "Edge case",
            "priority": "Medium",
            "objective": "boundary input",
            "steps": [{"action": "submit empty", "expected_result": "error"}],
        },
    ]
    return _run(
        env["artifacts"].create_generated_cases(
            env["LiveGeneratedCasesCreate"](
                ticket_key=ticket_key,
                instructions="",
                cases=cases,
                status=status,
            )
        )
    )


def _request(env, **overrides):
    body = {
        "ticket_key": "FM-9",
        "project_key": "FM",
        "case_indexes": None,
        "mode": "linked_test_cases",
        "fallback_to_comment": True,
        "folder_id": None,
        "confirm_duplicate": False,
    }
    body.update(overrides)
    return env["LivePublishCasesRequest"](**body)


# ---------------------------------------------------------------------------
# Primary path — Zephyr linked publish
# ---------------------------------------------------------------------------


class TestZephyrLinkedSuccess:

    def test_full_success_marks_exported_and_appears_on_ticket(self, publish_env):
        env = publish_env
        seen = {}

        async def fake_bulk(
            *, project_key, test_cases, folder_id=None, issue_links=None
        ):
            seen["project_key"] = project_key
            seen["count"] = len(test_cases)
            seen["folder_id"] = folder_id
            seen["issue_links"] = issue_links
            return {
                "created": [
                    {"name": tc["name"], "key": f"FM-T{i}", "id": str(i)}
                    for i, tc in enumerate(test_cases, start=1)
                ],
                "failed": [],
            }

        env["monkeypatch"].setattr(
            env["zephyr"], "create_test_cases_bulk", fake_bulk
        )

        case_set = _seed_case_set(env)
        resp = _run(
            env["publish"].publish_generated_cases(case_set.id, _request(env))
        )

        assert resp.status == "exported"
        assert resp.target == "zephyr_linked_tests"
        assert resp.created == 2
        assert resp.appears_on_jira_ticket is True
        assert [c.key for c in resp.created_test_cases] == ["FM-T1", "FM-T2"]
        assert resp.failed == []
        assert seen["issue_links"] == ["FM-9"]
        assert seen["project_key"] == "FM"
        assert seen["count"] == 2
        assert resp.exported_at

        # Persisted: exported status + encrypted export_metadata.
        reread = _run(env["artifacts"].get_generated_cases(case_set.id))
        assert reread.status == "exported"
        assert reread.exported_at == resp.exported_at
        assert reread.export_metadata["target"] == "zephyr_linked_tests"
        assert reread.export_metadata["appears_on_jira_ticket"] is True
        assert reread.export_metadata["source_ticket_key"] == "FM-9"

    def test_folder_id_passed_through(self, publish_env):
        env = publish_env
        captured = {}

        async def fake_bulk(*, project_key, test_cases, folder_id, issue_links):
            captured["folder_id"] = folder_id
            return {
                "created": [
                    {"name": tc["name"], "key": "K", "id": "1"}
                    for tc in test_cases
                ],
                "failed": [],
            }

        env["monkeypatch"].setattr(
            env["zephyr"], "create_test_cases_bulk", fake_bulk
        )
        case_set = _seed_case_set(env)
        _run(
            env["publish"].publish_generated_cases(
                case_set.id, _request(env, folder_id=42)
            )
        )
        assert captured["folder_id"] == 42

    def test_case_indexes_filter_selection(self, publish_env):
        env = publish_env
        captured = {}

        async def fake_bulk(*, project_key, test_cases, folder_id, issue_links):
            captured["names"] = [tc["name"] for tc in test_cases]
            return {
                "created": [
                    {"name": tc["name"], "key": f"K{i}", "id": str(i)}
                    for i, tc in enumerate(test_cases)
                ],
                "failed": [],
            }

        env["monkeypatch"].setattr(
            env["zephyr"], "create_test_cases_bulk", fake_bulk
        )
        case_set = _seed_case_set(env)
        _run(
            env["publish"].publish_generated_cases(
                case_set.id, _request(env, case_indexes=[1])
            )
        )
        assert captured["names"] == ["Edge case"]


# ---------------------------------------------------------------------------
# Partial failures
# ---------------------------------------------------------------------------


class TestZephyrPartial:

    def test_partial_export_includes_created_and_failed(self, publish_env):
        env = publish_env

        async def fake_bulk(*, project_key, test_cases, folder_id, issue_links):
            return {
                "created": [
                    {"name": test_cases[0]["name"], "key": "FM-T1", "id": "1"}
                ],
                "failed": [
                    {
                        "name": test_cases[1]["name"],
                        "error": "Zephyr 500 on second case",
                    }
                ],
            }

        env["monkeypatch"].setattr(
            env["zephyr"], "create_test_cases_bulk", fake_bulk
        )
        case_set = _seed_case_set(env)
        resp = _run(
            env["publish"].publish_generated_cases(case_set.id, _request(env))
        )
        assert resp.status == "partial_export"
        assert resp.created == 1
        assert len(resp.failed) == 1
        assert resp.failed[0].name == "Edge case"
        assert resp.target == "zephyr_linked_tests"

    def test_link_failed_marks_not_appearing_on_ticket(self, publish_env):
        env = publish_env

        async def fake_bulk(*, project_key, test_cases, folder_id, issue_links):
            # All cases were created in Zephyr but the issue link failed —
            # they exist as floating tests and won't show up on the Jira
            # ticket's Test Cases panel.
            return {
                "created": [],
                "failed": [
                    {
                        "name": tc["name"],
                        "error": "issue link API rejected",
                        "issue_link_failed": True,
                        "created_test_case": {"key": "FM-T1"},
                    }
                    for tc in test_cases
                ],
            }

        env["monkeypatch"].setattr(
            env["zephyr"], "create_test_cases_bulk", fake_bulk
        )
        # No fallback so we get the failure path.
        case_set = _seed_case_set(env)
        resp = _run(
            env["publish"].publish_generated_cases(
                case_set.id, _request(env, fallback_to_comment=False)
            )
        )
        # Nothing created, no fallback → typed failure preserving draft.
        assert resp.status == "draft"
        assert resp.target == "none"
        assert resp.appears_on_jira_ticket is False


# ---------------------------------------------------------------------------
# Comment fallback (explicit + on-failure)
# ---------------------------------------------------------------------------


class TestCommentFallback:

    def test_explicit_jira_comment_mode(self, publish_env):
        env = publish_env
        captured = {}

        async def fake_post_comment(ticket_key, body):
            captured["ticket_key"] = ticket_key
            captured["body"] = body
            return {
                "id": "comment-1",
                "author": "Test",
                "created": "2026-05-16T00:00:00Z",
            }

        env["monkeypatch"].setattr(
            env["jira"], "post_comment", fake_post_comment
        )

        case_set = _seed_case_set(env)
        resp = _run(
            env["publish"].publish_generated_cases(
                case_set.id, _request(env, mode="jira_comment")
            )
        )
        assert resp.status == "commented"
        assert resp.target == "jira_comment"
        assert resp.appears_on_jira_ticket is False
        assert resp.jira_comment is not None
        assert resp.jira_comment.id == "comment-1"
        assert captured["ticket_key"] == "FM-9"
        assert "Testdeck generated test cases" in captured["body"]
        # Persistence reflects the commented status.
        reread = _run(env["artifacts"].get_generated_cases(case_set.id))
        assert reread.status == "commented"
        assert reread.export_metadata["jira_comment"]["id"] == "comment-1"

    def test_zephyr_failure_falls_back_to_comment(self, publish_env):
        env = publish_env

        async def fake_bulk(**_):
            raise RuntimeError("zephyr offline")

        async def fake_post_comment(ticket_key, body):
            return {"id": "c-42", "author": None, "created": None}

        env["monkeypatch"].setattr(
            env["zephyr"], "create_test_cases_bulk", fake_bulk
        )
        env["monkeypatch"].setattr(
            env["jira"], "post_comment", fake_post_comment
        )

        case_set = _seed_case_set(env)
        resp = _run(
            env["publish"].publish_generated_cases(
                case_set.id, _request(env, fallback_to_comment=True)
            )
        )
        assert resp.status == "commented"
        assert resp.jira_comment.id == "c-42"
        assert resp.appears_on_jira_ticket is False

    def test_fallback_disabled_keeps_draft_on_zephyr_failure(self, publish_env):
        env = publish_env
        called = {"comment": 0}

        async def fake_bulk(**_):
            raise RuntimeError("zephyr offline")

        async def fake_post_comment(ticket_key, body):
            called["comment"] += 1
            return {"id": "should-not-be-called"}

        env["monkeypatch"].setattr(
            env["zephyr"], "create_test_cases_bulk", fake_bulk
        )
        env["monkeypatch"].setattr(
            env["jira"], "post_comment", fake_post_comment
        )

        case_set = _seed_case_set(env)
        resp = _run(
            env["publish"].publish_generated_cases(
                case_set.id, _request(env, fallback_to_comment=False)
            )
        )
        assert resp.status == "draft"
        assert resp.target == "none"
        assert called["comment"] == 0
        # Draft is preserved (no destructive flip-to-failed).
        reread = _run(env["artifacts"].get_generated_cases(case_set.id))
        assert reread.status == "draft"
        # Export metadata records the failure for the UI.
        assert reread.export_metadata["target"] == "none"
        assert len(reread.export_metadata["failed"]) == 2


# ---------------------------------------------------------------------------
# Duplicate-publish protection
# ---------------------------------------------------------------------------


class TestDuplicatePublish:

    def test_duplicate_requires_confirm_flag(self, publish_env):
        env = publish_env

        async def fake_bulk(**_):
            return {"created": [{"name": "x", "key": "K", "id": "1"}], "failed": []}

        env["monkeypatch"].setattr(
            env["zephyr"], "create_test_cases_bulk", fake_bulk
        )

        case_set = _seed_case_set(env)
        # First publish succeeds.
        _run(
            env["publish"].publish_generated_cases(
                case_set.id, _request(env, case_indexes=[0])
            )
        )
        # Second publish without confirm flag must raise PublishError.
        with pytest.raises(env["publish"].PublishError) as exc:
            _run(
                env["publish"].publish_generated_cases(
                    case_set.id, _request(env, case_indexes=[0])
                )
            )
        assert exc.value.code == "duplicate_publish_unconfirmed"

    def test_duplicate_attempt_recorded_when_confirmed(self, publish_env):
        env = publish_env

        async def fake_bulk(**_):
            return {"created": [{"name": "x", "key": "K", "id": "1"}], "failed": []}

        env["monkeypatch"].setattr(
            env["zephyr"], "create_test_cases_bulk", fake_bulk
        )
        case_set = _seed_case_set(env)
        _run(
            env["publish"].publish_generated_cases(
                case_set.id, _request(env, case_indexes=[0])
            )
        )
        resp = _run(
            env["publish"].publish_generated_cases(
                case_set.id,
                _request(env, case_indexes=[0], confirm_duplicate=True),
            )
        )
        assert resp.duplicate_attempt is True
        reread = _run(env["artifacts"].get_generated_cases(case_set.id))
        assert reread.export_metadata["duplicate_attempt"] is True


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


class TestValidation:

    def test_unknown_case_set_id(self, publish_env):
        env = publish_env
        with pytest.raises(env["publish"].PublishError) as exc:
            _run(
                env["publish"].publish_generated_cases(
                    "no-such-id", _request(env)
                )
            )
        assert exc.value.code == "case_set_not_found"

    def test_empty_case_set(self, publish_env):
        env = publish_env
        case_set = _seed_case_set(env, cases=[])
        with pytest.raises(env["publish"].PublishError) as exc:
            _run(
                env["publish"].publish_generated_cases(case_set.id, _request(env))
            )
        assert exc.value.code == "no_cases_in_set"

    def test_invalid_case_index(self, publish_env):
        env = publish_env
        case_set = _seed_case_set(env)
        with pytest.raises(env["publish"].PublishError) as exc:
            _run(
                env["publish"].publish_generated_cases(
                    case_set.id, _request(env, case_indexes=[99])
                )
            )
        assert exc.value.code == "invalid_case_index"


# ---------------------------------------------------------------------------
# Persistence semantics — encryption is exercised in test_live_artifact_security
# but we sanity-check round-trip through patch_generated_cases here too.
# ---------------------------------------------------------------------------


class TestPersistedExportMetadataShape:

    def test_export_metadata_roundtrips_as_json(self, publish_env):
        env = publish_env

        async def fake_bulk(**_):
            return {
                "created": [{"name": "x", "key": "FM-T1", "id": "1"}],
                "failed": [],
            }

        env["monkeypatch"].setattr(
            env["zephyr"], "create_test_cases_bulk", fake_bulk
        )
        case_set = _seed_case_set(env)
        _run(
            env["publish"].publish_generated_cases(
                case_set.id, _request(env, case_indexes=[0])
            )
        )
        reread = _run(env["artifacts"].get_generated_cases(case_set.id))
        # Plain serialization must round-trip the export metadata.
        assert json.dumps(reread.export_metadata)
        assert reread.export_metadata["selected_case_indexes"] == [0]


# ---------------------------------------------------------------------------
# Phase 06c — Live publish defaults + frontend-supplied comment body
# ---------------------------------------------------------------------------


class TestPhase06cFieldDefaults:
    """Live publishes default to the Jira Test Cases custom field."""

    def test_default_mode_is_jira_test_cases_field(self, publish_env):
        req = publish_env["LivePublishCasesRequest"](
            ticket_key="FM-9", project_key="FM"
        )
        assert req.mode == "jira_test_cases_field"
        # Default fallback_to_comment is True so a transient field-edit
        # failure rolls into a Jira comment instead of losing the publish.
        assert req.fallback_to_comment is True
        # Customer-confirmed field id for this tenant.
        assert req.test_cases_field_id == "customfield_11001"

    def test_default_request_writes_to_jira_field(self, publish_env):
        env = publish_env
        captured = {}

        async def fake_field(ticket_key, body, field_id="customfield_11001"):
            captured["ticket_key"] = ticket_key
            captured["body"] = body
            captured["field_id"] = field_id
            return {
                "field_id": field_id,
                "ticket_key": ticket_key,
                "updated_at": "2026-05-17T12:00:00Z",
            }

        async def fake_post_comment(*_, **__):
            raise AssertionError(
                "default field publish must not fall through to a comment"
            )

        async def fake_bulk(**_):
            raise AssertionError("default publish must not touch Zephyr")

        env["monkeypatch"].setattr(
            env["jira"], "set_test_cases_field", fake_field
        )
        env["monkeypatch"].setattr(
            env["jira"], "post_comment", fake_post_comment
        )
        env["monkeypatch"].setattr(
            env["zephyr"], "create_test_cases_bulk", fake_bulk
        )

        case_set = _seed_case_set(env)
        req = env["LivePublishCasesRequest"](
            ticket_key="FM-9", project_key="FM"
        )
        resp = _run(env["publish"].publish_generated_cases(case_set.id, req))
        assert resp.status == "exported"
        assert resp.target == "jira_test_cases_field"
        assert resp.appears_on_jira_ticket is True
        assert resp.jira_field is not None
        assert resp.jira_field.field_id == "customfield_11001"
        assert captured["field_id"] == "customfield_11001"
        assert "Testdeck generated test cases" in captured["body"]

    def test_field_write_failure_falls_back_to_comment(self, publish_env):
        env = publish_env

        async def boom(*_, **__):
            raise RuntimeError("jira 500 on field edit")

        async def fake_comment(ticket_key, body):
            return {"id": "c-fb", "author": None, "created": None}

        env["monkeypatch"].setattr(
            env["jira"], "set_test_cases_field", boom
        )
        env["monkeypatch"].setattr(env["jira"], "post_comment", fake_comment)

        case_set = _seed_case_set(env)
        req = env["LivePublishCasesRequest"](
            ticket_key="FM-9",
            project_key="FM",
            fallback_to_comment=True,
        )
        resp = _run(env["publish"].publish_generated_cases(case_set.id, req))
        assert resp.status == "commented"
        assert resp.target == "jira_comment"
        assert resp.appears_on_jira_ticket is False

    def test_field_write_failure_without_fallback_keeps_draft(
        self, publish_env
    ):
        env = publish_env
        called = {"comment": 0}

        async def boom(*_, **__):
            raise RuntimeError("jira 500 on field edit")

        async def fake_comment(*_, **__):
            called["comment"] += 1
            return {"id": "should-not-be-called"}

        env["monkeypatch"].setattr(
            env["jira"], "set_test_cases_field", boom
        )
        env["monkeypatch"].setattr(env["jira"], "post_comment", fake_comment)

        case_set = _seed_case_set(env)
        req = env["LivePublishCasesRequest"](
            ticket_key="FM-9",
            project_key="FM",
            fallback_to_comment=False,
        )
        resp = _run(env["publish"].publish_generated_cases(case_set.id, req))
        assert resp.status == "draft"
        assert resp.target == "none"
        assert called["comment"] == 0

    def test_custom_field_id_passed_through(self, publish_env):
        env = publish_env
        captured = {}

        async def fake_field(ticket_key, body, field_id="customfield_11001"):
            captured["field_id"] = field_id
            return {
                "field_id": field_id,
                "ticket_key": ticket_key,
                "updated_at": None,
            }

        env["monkeypatch"].setattr(
            env["jira"], "set_test_cases_field", fake_field
        )

        case_set = _seed_case_set(env)
        req = env["LivePublishCasesRequest"](
            ticket_key="FM-9",
            project_key="FM",
            test_cases_field_id="customfield_99999",
        )
        _run(env["publish"].publish_generated_cases(case_set.id, req))
        assert captured["field_id"] == "customfield_99999"


class TestPhase06cBodyOverride:
    """Frontend-supplied body is the source of truth for the posted text."""

    def test_field_body_override_used_verbatim(self, publish_env):
        env = publish_env
        captured = {}

        async def fake_field(ticket_key, body, field_id="customfield_11001"):
            captured["body"] = body
            return {
                "field_id": field_id,
                "ticket_key": ticket_key,
                "updated_at": None,
            }

        env["monkeypatch"].setattr(
            env["jira"], "set_test_cases_field", fake_field
        )

        case_set = _seed_case_set(env)
        override = "Frontend-rendered preview body\nLine 2\n"
        _run(
            env["publish"].publish_generated_cases(
                case_set.id,
                _request(
                    env, mode="jira_test_cases_field", body=override
                ),
            )
        )
        assert captured["body"] == override

    def test_comment_mode_uses_same_body_field(self, publish_env):
        env = publish_env
        captured = {}

        async def fake_comment(ticket_key, body):
            captured["body"] = body
            return {"id": "c-ov", "author": None, "created": None}

        env["monkeypatch"].setattr(env["jira"], "post_comment", fake_comment)

        case_set = _seed_case_set(env)
        override = "Preview-supplied comment body."
        _run(
            env["publish"].publish_generated_cases(
                case_set.id,
                _request(env, mode="jira_comment", body=override),
            )
        )
        assert captured["body"] == override


class TestPhase06cBodyShape:
    """The backend formatter emits Jira-readable structure for both targets."""

    def test_per_case_sections_with_priority_steps_separator(self, publish_env):
        env = publish_env
        captured = {}

        async def fake_field(ticket_key, body, field_id="customfield_11001"):
            captured["body"] = body
            return {
                "field_id": field_id,
                "ticket_key": ticket_key,
                "updated_at": None,
            }

        env["monkeypatch"].setattr(
            env["jira"], "set_test_cases_field", fake_field
        )

        case_set = _seed_case_set(env)
        _run(
            env["publish"].publish_generated_cases(
                case_set.id,
                _request(env, mode="jira_test_cases_field"),
            )
        )
        body = captured["body"]
        assert body.startswith("Testdeck generated test cases\n")
        assert "Source ticket: FM-9" in body
        assert "Case 1: Happy path" in body
        assert "[High]" in body
        assert "Case 2: Edge case" in body
        assert "[Medium]" in body
        assert "  1. open page" in body
        assert "Expected: page renders" in body
        assert "\n----\n" in body
        assert body.rstrip().endswith("Expected: error")


# ---------------------------------------------------------------------------
# Phase 06c — per-case partial updates
# ---------------------------------------------------------------------------


class TestPhase06cPartialCaseUpdates:
    """case_updates surgically replaces a single case without losing siblings."""

    def test_case_updates_replaces_one_case(self, publish_env):
        env = publish_env
        from schemas.live_models import (
            LiveCaseUpdateEntry,
            LiveGeneratedCasesPatch,
        )

        case_set = _seed_case_set(env)
        updated = _run(
            env["artifacts"].patch_generated_cases(
                case_set.id,
                LiveGeneratedCasesPatch(
                    case_updates=[
                        LiveCaseUpdateEntry(
                            index=0,
                            case={
                                "name": "Happy path (edited)",
                                "priority": "Critical",
                                "objective": "covers main flow + audit",
                                "steps": [
                                    {
                                        "action": "open page",
                                        "expected_result": "page renders",
                                    }
                                ],
                            },
                        )
                    ]
                ),
            )
        )
        assert updated is not None
        assert updated.cases[0]["name"] == "Happy path (edited)"
        assert updated.cases[0]["priority"] == "Critical"
        # Sibling untouched.
        assert updated.cases[1]["name"] == "Edge case"
        assert updated.cases[1]["priority"] == "Medium"

    def test_case_updates_preserves_export_metadata(
        self, publish_env, monkeypatch
    ):
        env = publish_env
        from schemas.live_models import (
            LiveCaseUpdateEntry,
            LiveGeneratedCasesPatch,
        )

        async def fake_post_comment(ticket_key, body):
            return {"id": "c-pres", "author": None, "created": None}

        env["monkeypatch"].setattr(
            env["jira"], "post_comment", fake_post_comment
        )

        case_set = _seed_case_set(env)
        _run(
            env["publish"].publish_generated_cases(
                case_set.id, _request(env, mode="jira_comment")
            )
        )
        before = _run(env["artifacts"].get_generated_cases(case_set.id))
        assert before.export_metadata is not None
        baseline_export = before.export_metadata

        # Edit one case; export_metadata must not be touched.
        _run(
            env["artifacts"].patch_generated_cases(
                case_set.id,
                LiveGeneratedCasesPatch(
                    case_updates=[
                        LiveCaseUpdateEntry(
                            index=1,
                            case={
                                "name": "Edge case (edited)",
                                "priority": "Low",
                                "steps": [
                                    {
                                        "action": "submit empty",
                                        "expected_result": "error",
                                    }
                                ],
                            },
                        )
                    ]
                ),
            )
        )
        after = _run(env["artifacts"].get_generated_cases(case_set.id))
        assert after.cases[1]["name"] == "Edge case (edited)"
        assert after.export_metadata == baseline_export

    def test_case_updates_out_of_range_raises(self, publish_env):
        env = publish_env
        from schemas.live_models import (
            LiveCaseUpdateEntry,
            LiveGeneratedCasesPatch,
        )

        case_set = _seed_case_set(env)
        with pytest.raises(ValueError):
            _run(
                env["artifacts"].patch_generated_cases(
                    case_set.id,
                    LiveGeneratedCasesPatch(
                        case_updates=[
                            LiveCaseUpdateEntry(
                                index=99,
                                case={"name": "nope"},
                            )
                        ]
                    ),
                )
            )
