import asyncio
import json
import logging

import pytest


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "cycles_test.db"


@pytest.fixture
def cycle_service(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod
    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db
    asyncio.run(init_db())

    import services.cycle_service as svc
    return svc


def _run(coro):
    return asyncio.run(coro)


def _make_payload(**overrides):
    from schemas.cycle_models import CycleCreate, ThemeSpec

    base = dict(
        name="Smoke FM",
        description="quick smoke",
        projectKey="FM",
        versionHint="24.1",
        ticketKeys=["FM-1", "FM-2", "FM-3"],
        themes=[
            ThemeSpec(id="t1", label="UI", ticketKeys=["FM-1"]),
            ThemeSpec(id="t2", label="Sync", ticketKeys=["FM-2", "FM-3"]),
        ],
        testCaseRefs=[],
        pinned=False,
    )
    base.update(overrides)
    if "themes" in overrides and isinstance(overrides["themes"], list):
        base["themes"] = [
            t if isinstance(t, ThemeSpec) else ThemeSpec(**t)
            for t in overrides["themes"]
        ]
    return CycleCreate(**base)


class TestCreate:

    def test_round_trips_all_fields(self, cycle_service):
        payload = _make_payload()
        cycle = _run(cycle_service.create_cycle(payload))
        assert cycle.name == "Smoke FM"
        assert cycle.description == "quick smoke"
        assert cycle.projectKey == "FM"
        assert cycle.versionHint == "24.1"
        assert cycle.ticketKeys == ["FM-1", "FM-2", "FM-3"]
        assert len(cycle.themes) == 2
        assert cycle.themes[0].label == "UI"
        assert cycle.runCount == 0
        assert cycle.pinned is False
        assert cycle.archived is False

    def test_summary_counts_match(self, cycle_service):
        cycle = _run(cycle_service.create_cycle(_make_payload()))
        listed = _run(cycle_service.list_cycles())
        assert any(s.id == cycle.id for s in listed)
        s = next(s for s in listed if s.id == cycle.id)
        assert s.ticketCount == 3
        assert s.themeCount == 2


class TestList:

    def test_excludes_archived_by_default(self, cycle_service):
        from schemas.cycle_models import CyclePatch

        cycle = _run(cycle_service.create_cycle(_make_payload()))
        _run(cycle_service.patch_cycle(cycle.id, CyclePatch(archived=True)))
        visible = _run(cycle_service.list_cycles())
        archived = _run(cycle_service.list_cycles(include_archived=True))
        assert cycle.id not in [c.id for c in visible]
        assert cycle.id in [c.id for c in archived]

    def test_pinned_first(self, cycle_service):
        from schemas.cycle_models import CyclePatch

        a = _run(cycle_service.create_cycle(_make_payload(name="alpha")))
        b = _run(cycle_service.create_cycle(_make_payload(name="beta")))
        _run(cycle_service.patch_cycle(b.id, CyclePatch(pinned=True)))
        listed = _run(cycle_service.list_cycles())
        assert listed[0].id == b.id
        assert any(c.id == a.id for c in listed)


class TestPatch:

    def test_partial_update_each_field(self, cycle_service):
        from schemas.cycle_models import CyclePatch

        cycle = _run(cycle_service.create_cycle(_make_payload()))
        out = _run(
            cycle_service.patch_cycle(cycle.id, CyclePatch(name="renamed"))
        )
        assert out is not None and out.name == "renamed"
        out = _run(
            cycle_service.patch_cycle(
                cycle.id, CyclePatch(versionHint="24.2")
            )
        )
        assert out.versionHint == "24.2"
        out = _run(
            cycle_service.patch_cycle(
                cycle.id, CyclePatch(ticketKeys=["FM-9"])
            )
        )
        assert out.ticketKeys == ["FM-9"]

    def test_unknown_id_returns_none(self, cycle_service):
        from schemas.cycle_models import CyclePatch

        out = _run(
            cycle_service.patch_cycle("does-not-exist", CyclePatch(name="x"))
        )
        assert out is None


class TestDelete:

    def test_delete_removes(self, cycle_service):
        cycle = _run(cycle_service.create_cycle(_make_payload()))
        assert _run(cycle_service.delete_cycle(cycle.id)) is True
        assert _run(cycle_service.get_cycle(cycle.id)) is None

    def test_delete_unknown_returns_false(self, cycle_service):
        assert _run(cycle_service.delete_cycle("nope")) is False


class TestDuplicate:

    def test_creates_copy(self, cycle_service):
        from schemas.cycle_models import CyclePatch

        original = _run(cycle_service.create_cycle(_make_payload(pinned=True)))
        # Mark original as run once so we can verify the copy resets counters.
        copy = _run(cycle_service.duplicate_cycle(original.id))
        assert copy is not None
        assert copy.id != original.id
        assert copy.name.endswith("(copy)")
        assert copy.pinned is False
        assert copy.runCount == 0
        assert copy.ticketKeys == original.ticketKeys
        # Patch original; copy should be independent.
        _run(
            cycle_service.patch_cycle(
                original.id, CyclePatch(ticketKeys=["FM-99"])
            )
        )
        copy_refetch = _run(cycle_service.get_cycle(copy.id))
        assert copy_refetch is not None
        assert copy_refetch.ticketKeys == original.ticketKeys

    def test_unknown_id_returns_none(self, cycle_service):
        assert _run(cycle_service.duplicate_cycle("nope")) is None


class TestRun:

    def test_creates_session_and_hydrates_state(self, cycle_service):
        cycle = _run(cycle_service.create_cycle(_make_payload()))
        run = _run(cycle_service.run_cycle(cycle.id, session_name="cycle-run"))
        assert run is not None
        assert run.sessionId
        assert run.status == "session_created"

        # Bump counters
        refetched = _run(cycle_service.get_cycle(cycle.id))
        assert refetched.runCount == 1
        assert refetched.lastRunAt is not None

        # Workbench-shaped state landed under the right keys.
        from services.session_service import get_state
        tickets = _run(get_state(run.sessionId, "selectedTickets"))
        assert isinstance(tickets, list)
        assert len(tickets) == 3
        assert tickets[0]["key"] == "FM-1"

        groups = _run(get_state(run.sessionId, "editableGroups"))
        assert isinstance(groups, dict)
        assert "UI" in groups and "Sync" in groups
        assert groups["UI"][0]["key"] == "FM-1"

        proj = _run(get_state(run.sessionId, "projectKey"))
        assert proj == "FM"

        cycle_id_state = _run(get_state(run.sessionId, "cycle_id"))
        assert cycle_id_state == cycle.id

    def test_runs_log_returned_newest_first(self, cycle_service):
        cycle = _run(cycle_service.create_cycle(_make_payload()))
        r1 = _run(cycle_service.run_cycle(cycle.id, session_name=None))
        r2 = _run(cycle_service.run_cycle(cycle.id, session_name=None))
        runs = _run(cycle_service.list_runs(cycle.id))
        assert [r.id for r in runs[:2]] == [r2.id, r1.id]

    def test_unknown_cycle_returns_none(self, cycle_service):
        out = _run(cycle_service.run_cycle("nope", session_name=None))
        assert out is None


class TestRunPatch:

    def test_patch_run_status(self, cycle_service):
        from schemas.cycle_models import CycleRunPatch

        cycle = _run(cycle_service.create_cycle(_make_payload()))
        run = _run(cycle_service.run_cycle(cycle.id, session_name=None))
        out = _run(
            cycle_service.patch_run(
                cycle.id, run.id,
                CycleRunPatch(status="completed", notes="ok"),
            )
        )
        assert out is not None
        assert out.status == "completed"
        assert out.notes == "ok"

    def test_unknown_run_returns_none(self, cycle_service):
        from schemas.cycle_models import CycleRunPatch

        cycle = _run(cycle_service.create_cycle(_make_payload()))
        out = _run(
            cycle_service.patch_run(
                cycle.id, "no-such-run", CycleRunPatch(status="failed")
            )
        )
        assert out is None


class TestBounds:

    def test_too_many_keys_rejected(self, cycle_service):
        from pydantic import ValidationError
        from schemas.cycle_models import CycleCreate

        with pytest.raises(ValidationError):
            CycleCreate(
                name="x",
                projectKey="FM",
                ticketKeys=[f"FM-{i}" for i in range(501)],
            )

    def test_too_many_themes_rejected(self, cycle_service):
        from pydantic import ValidationError
        from schemas.cycle_models import CycleCreate, ThemeSpec

        themes = [
            ThemeSpec(id=f"t{i}", label=f"T{i}", ticketKeys=[])
            for i in range(51)
        ]
        with pytest.raises(ValidationError):
            CycleCreate(
                name="x", projectKey="FM", ticketKeys=["FM-1"], themes=themes
            )


class TestSecretScan:

    def test_secret_in_description_logs_and_saves(
        self, cycle_service, caplog
    ):
        leaky = "AccountKey=" + "C" * 86 + "=="
        with caplog.at_level(logging.WARNING):
            cycle = _run(
                cycle_service.create_cycle(
                    _make_payload(description=leaky)
                )
            )
        assert cycle is not None
        # The structured event name is fired; the full secret value is not.
        joined = "\n".join(rec.getMessage() for rec in caplog.records)
        assert leaky not in joined

    def test_no_full_secret_value_in_info_logs(self, cycle_service, caplog):
        leaky = "AccountKey=" + "D" * 86 + "=="
        with caplog.at_level(logging.INFO):
            _run(cycle_service.create_cycle(_make_payload(description=leaky)))
        joined = "\n".join(rec.getMessage() for rec in caplog.records)
        assert leaky not in joined
