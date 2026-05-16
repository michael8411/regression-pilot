"""Phase 08 — service-level CRUD coverage for live workflow artifacts.

Exercises `services.live_artifact_service` end-to-end against a real
encrypted SQLite database. Each test isolates state via a per-test
DB path and the shared `fake_keyring` fixture so the Fernet key is
deterministic.

These suites are part of the rollout exit gate: they prove every
artifact CRUD path round-trips through the encrypted store with
matching plaintext semantics for the route layer.
"""

from __future__ import annotations

import asyncio

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "live_artifact_service_test.db"


@pytest.fixture
def svc(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod

    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db

    asyncio.run(init_db())

    import services.live_artifact_service as artifact_service

    return artifact_service


@pytest.fixture
def schemas():
    from schemas.live_models import (
        LiveActivityCreate,
        LiveGeneratedCasesCreate,
        LiveGeneratedCasesPatch,
        LivePinnedTicketUpsert,
    )

    return {
        "LivePinnedTicketUpsert": LivePinnedTicketUpsert,
        "LiveGeneratedCasesCreate": LiveGeneratedCasesCreate,
        "LiveGeneratedCasesPatch": LiveGeneratedCasesPatch,
        "LiveActivityCreate": LiveActivityCreate,
    }


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Pinned tickets
# ---------------------------------------------------------------------------


class TestPinnedTicketsCRUD:

    def test_upsert_creates_and_returns_full_row(self, svc, schemas):
        payload = schemas["LivePinnedTicketUpsert"](
            board_id="board-1",
            ticket_snapshot={"key": "FM-9", "summary": "Sensor drift"},
        )
        result = _run(svc.upsert_pinned_ticket("FM-9", payload))
        assert result.ticket_key == "FM-9"
        assert result.board_id == "board-1"
        assert result.ticket_snapshot == {"key": "FM-9", "summary": "Sensor drift"}
        assert result.created_at
        assert result.updated_at

    def test_upsert_overwrites_existing(self, svc, schemas):
        first = schemas["LivePinnedTicketUpsert"](
            board_id=None, ticket_snapshot={"v": 1}
        )
        _run(svc.upsert_pinned_ticket("FM-1", first))
        second = schemas["LivePinnedTicketUpsert"](
            board_id="board-X", ticket_snapshot={"v": 2}
        )
        out = _run(svc.upsert_pinned_ticket("FM-1", second))
        assert out.board_id == "board-X"
        assert out.ticket_snapshot == {"v": 2}

    def test_list_returns_most_recently_updated_first(self, svc, schemas):
        for key in ("FM-1", "FM-2", "FM-3"):
            _run(
                svc.upsert_pinned_ticket(
                    key,
                    schemas["LivePinnedTicketUpsert"](
                        board_id=None, ticket_snapshot=None
                    ),
                )
            )
        rows = _run(svc.list_pinned_tickets())
        assert {r.ticket_key for r in rows} == {"FM-1", "FM-2", "FM-3"}
        # Most recent upsert (FM-3) should be first.
        assert rows[0].ticket_key == "FM-3"

    def test_delete_returns_true_when_present(self, svc, schemas):
        _run(
            svc.upsert_pinned_ticket(
                "FM-2",
                schemas["LivePinnedTicketUpsert"](
                    board_id=None, ticket_snapshot=None
                ),
            )
        )
        assert _run(svc.delete_pinned_ticket("FM-2")) is True
        assert _run(svc.delete_pinned_ticket("FM-2")) is False

    def test_empty_ticket_key_rejected(self, svc, schemas):
        with pytest.raises(ValueError):
            _run(
                svc.upsert_pinned_ticket(
                    "  ",
                    schemas["LivePinnedTicketUpsert"](
                        board_id=None, ticket_snapshot=None
                    ),
                )
            )

    def test_null_snapshot_round_trips_as_none(self, svc, schemas):
        out = _run(
            svc.upsert_pinned_ticket(
                "FM-7",
                schemas["LivePinnedTicketUpsert"](
                    board_id=None, ticket_snapshot=None
                ),
            )
        )
        assert out.ticket_snapshot is None


# ---------------------------------------------------------------------------
# Generated cases
# ---------------------------------------------------------------------------


class TestGeneratedCasesCRUD:

    def test_create_round_trips_all_payload_fields(self, svc, schemas):
        payload = schemas["LiveGeneratedCasesCreate"](
            ticket_key="FM-100",
            board_id="board-1",
            instructions="Cover happy + edge",
            cases=[{"name": "smoke", "steps": ["open"]}],
            context_metadata={"requestId": "req-1"},
            export_metadata=None,
            status="draft",
        )
        out = _run(svc.create_generated_cases(payload))
        assert out.id
        assert out.ticket_key == "FM-100"
        assert out.board_id == "board-1"
        assert out.instructions == "Cover happy + edge"
        assert out.cases == [{"name": "smoke", "steps": ["open"]}]
        assert out.context_metadata == {"requestId": "req-1"}
        assert out.status == "draft"
        assert out.exported_at is None

    def test_get_returns_none_for_unknown(self, svc):
        assert _run(svc.get_generated_cases("does-not-exist")) is None

    def test_list_filtered_by_ticket_key(self, svc, schemas):
        for tk in ("FM-1", "FM-2", "FM-1"):
            _run(
                svc.create_generated_cases(
                    schemas["LiveGeneratedCasesCreate"](
                        ticket_key=tk, instructions="i", cases=[]
                    )
                )
            )
        rows = _run(svc.list_generated_cases(ticket_key="FM-1"))
        assert len(rows) == 2
        assert all(r.ticket_key == "FM-1" for r in rows)

    def test_patch_updates_only_provided_fields(self, svc, schemas):
        created = _run(
            svc.create_generated_cases(
                schemas["LiveGeneratedCasesCreate"](
                    ticket_key="FM-1",
                    instructions="original",
                    cases=[{"name": "a"}],
                )
            )
        )
        out = _run(
            svc.patch_generated_cases(
                created.id,
                schemas["LiveGeneratedCasesPatch"](
                    instructions="updated",
                    cases=[{"name": "a"}, {"name": "b"}],
                ),
            )
        )
        assert out.instructions == "updated"
        assert out.cases == [{"name": "a"}, {"name": "b"}]
        # Status not patched — must remain
        assert out.status == "draft"

    def test_patch_status_to_exported_sets_exported_at(self, svc, schemas):
        created = _run(
            svc.create_generated_cases(
                schemas["LiveGeneratedCasesCreate"](
                    ticket_key="FM-1", instructions="", cases=[]
                )
            )
        )
        out = _run(
            svc.patch_generated_cases(
                created.id,
                schemas["LiveGeneratedCasesPatch"](
                    status="exported",
                    exported_at="2026-05-16T00:00:00Z",
                ),
            )
        )
        assert out.status == "exported"
        assert out.exported_at == "2026-05-16T00:00:00Z"

    def test_patch_empty_returns_existing(self, svc, schemas):
        created = _run(
            svc.create_generated_cases(
                schemas["LiveGeneratedCasesCreate"](
                    ticket_key="FM-1", instructions="x", cases=[]
                )
            )
        )
        same = _run(
            svc.patch_generated_cases(
                created.id, schemas["LiveGeneratedCasesPatch"]()
            )
        )
        assert same.id == created.id
        assert same.instructions == "x"

    def test_patch_unknown_returns_none(self, svc, schemas):
        out = _run(
            svc.patch_generated_cases(
                "no-id",
                schemas["LiveGeneratedCasesPatch"](instructions="?"),
            )
        )
        assert out is None

    def test_delete(self, svc, schemas):
        created = _run(
            svc.create_generated_cases(
                schemas["LiveGeneratedCasesCreate"](
                    ticket_key="FM-1", instructions="", cases=[]
                )
            )
        )
        assert _run(svc.delete_generated_cases(created.id)) is True
        assert _run(svc.get_generated_cases(created.id)) is None
        assert _run(svc.delete_generated_cases(created.id)) is False


# ---------------------------------------------------------------------------
# Activity feed
# ---------------------------------------------------------------------------


class TestActivityCRUD:

    def test_create_round_trips(self, svc, schemas):
        payload = schemas["LiveActivityCreate"](
            board_id="board-1",
            ticket_key="FM-9",
            kind="ticket_pinned",
            summary="pinned FM-9",
            detail="from drawer",
        )
        out = _run(svc.create_activity(payload))
        assert out.kind == "ticket_pinned"
        assert out.summary == "pinned FM-9"
        assert out.detail == "from drawer"
        assert out.created_at
        assert out.id

    def test_list_returns_newest_first(self, svc, schemas):
        for i in range(3):
            _run(
                svc.create_activity(
                    schemas["LiveActivityCreate"](
                        kind="other", summary=f"s-{i}", detail=""
                    )
                )
            )
        rows = _run(svc.list_activity())
        assert len(rows) == 3
        assert rows[0].summary == "s-2"

    def test_list_respects_limit_bounds(self, svc, schemas):
        for i in range(5):
            _run(
                svc.create_activity(
                    schemas["LiveActivityCreate"](
                        kind="other", summary=f"s-{i}", detail=""
                    )
                )
            )
        # Limit below 1 still returns >=1 row.
        rows = _run(svc.list_activity(limit=0))
        assert len(rows) >= 1
        # Very large limit clamped.
        rows = _run(svc.list_activity(limit=10_000))
        assert len(rows) == 5

    def test_list_filtered_by_board(self, svc, schemas):
        _run(
            svc.create_activity(
                schemas["LiveActivityCreate"](
                    board_id="A", kind="other", summary="a", detail=""
                )
            )
        )
        _run(
            svc.create_activity(
                schemas["LiveActivityCreate"](
                    board_id="B", kind="other", summary="b", detail=""
                )
            )
        )
        rows = _run(svc.list_activity(board_id="A"))
        assert [r.board_id for r in rows] == ["A"]

    def test_clear_all(self, svc, schemas):
        for i in range(3):
            _run(
                svc.create_activity(
                    schemas["LiveActivityCreate"](
                        kind="other", summary=f"s-{i}", detail=""
                    )
                )
            )
        deleted = _run(svc.clear_activity())
        assert deleted == 3
        assert _run(svc.list_activity()) == []

    def test_clear_scoped_to_board(self, svc, schemas):
        _run(
            svc.create_activity(
                schemas["LiveActivityCreate"](
                    board_id="A", kind="other", summary="a"
                )
            )
        )
        _run(
            svc.create_activity(
                schemas["LiveActivityCreate"](
                    board_id="B", kind="other", summary="b"
                )
            )
        )
        deleted = _run(svc.clear_activity(board_id="A"))
        assert deleted == 1
        remaining = _run(svc.list_activity())
        assert {r.board_id for r in remaining} == {"B"}


# ---------------------------------------------------------------------------
# Corruption resilience — never 500 on a tampered row
# ---------------------------------------------------------------------------


class TestCorruptionResilience:

    def test_corrupted_snapshot_returns_none(self, svc, schemas):
        _run(
            svc.upsert_pinned_ticket(
                "FM-1",
                schemas["LivePinnedTicketUpsert"](
                    board_id=None, ticket_snapshot={"x": 1}
                ),
            )
        )

        async def corrupt():
            from db.connection import get_connection

            async with get_connection() as db:
                await db.execute(
                    "UPDATE live_pinned_tickets SET ticket_snapshot = ? "
                    "WHERE ticket_key = ?",
                    ("not-fernet", "FM-1"),
                )
                await db.commit()

        _run(corrupt())
        rows = _run(svc.list_pinned_tickets())
        assert rows[0].ticket_snapshot is None

    def test_corrupted_cases_falls_back_to_empty_list(self, svc, schemas):
        created = _run(
            svc.create_generated_cases(
                schemas["LiveGeneratedCasesCreate"](
                    ticket_key="FM-1",
                    instructions="i",
                    cases=[{"name": "smoke"}],
                )
            )
        )

        async def corrupt():
            from db.connection import get_connection

            async with get_connection() as db:
                await db.execute(
                    "UPDATE live_generated_cases SET cases_json = ? WHERE id = ?",
                    ("not-fernet", created.id),
                )
                await db.commit()

        _run(corrupt())
        out = _run(svc.get_generated_cases(created.id))
        assert out is not None
        assert out.cases == []
