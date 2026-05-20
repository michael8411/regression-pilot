"""SQL table inference — HCSS domain hints, allowlist filtering, reasons."""

from __future__ import annotations

from services.context_bundle_service import (
    DOMAIN_TABLE_HINTS,
    infer_sql_tables,
    infer_sql_tables_with_reasons,
)


class TestDomainHints:
    def test_pay_adjustment_term_matches(self, fake_keyring):
        ticket = {
            "summary": "Pay adjustment not saving for night-shift hours",
            "description": "",
            "labels": ["Payroll"],
            "components": [],
        }
        tables = infer_sql_tables(ticket)
        joined = ",".join(tables)
        assert "PayAdjustment" in joined

    def test_time_card_term_matches(self, fake_keyring):
        ticket = {
            "summary": "Time card export missing job number",
            "description": "",
            "labels": [],
            "components": [],
        }
        tables = infer_sql_tables(ticket)
        assert "TimeCard" in tables or "Timecard" in tables

    def test_timecard_one_word_term_matches(self, fake_keyring):
        ticket = {
            "summary": "timecard summary report wrong",
            "description": "",
            "labels": [],
            "components": [],
        }
        tables = infer_sql_tables(ticket)
        assert any(t.lower() == "timecard" for t in tables)

    def test_work_order_term_matches(self, fake_keyring):
        ticket = {
            "summary": "Work order status stuck on closed",
            "description": "",
            "labels": [],
            "components": [],
        }
        assert "WorkOrder" in infer_sql_tables(ticket)

    def test_sync_term_matches(self, fake_keyring):
        ticket = {
            "summary": "Offline sync delta missing PayAdjustment rows",
            "description": "",
            "labels": ["SYNC"],
            "components": [],
        }
        assert "Outbox" in infer_sql_tables(ticket) or "Delta" in infer_sql_tables(ticket)

    def test_payroll_term_matches(self, fake_keyring):
        ticket = {
            "summary": "Payroll calculation off by overtime hours",
            "description": "",
            "labels": [],
            "components": [],
        }
        assert "Payroll" in infer_sql_tables(ticket) or "PayPeriod" in infer_sql_tables(ticket)

    def test_mechanic_term_matches(self, fake_keyring):
        ticket = {
            "summary": "Mechanic clock-in",
            "description": "",
            "labels": [],
            "components": [],
        }
        assert "Mechanic" in infer_sql_tables(ticket)

    def test_equipment_term_matches(self, fake_keyring):
        ticket = {
            "summary": "Equipment usage missing on report",
            "description": "",
            "labels": [],
            "components": [],
        }
        tables = infer_sql_tables(ticket)
        assert "Equipment" in tables or "Asset" in tables

    def test_domain_table_hints_dict_is_lowercase_keyed(self):
        for key in DOMAIN_TABLE_HINTS:
            assert key == key.lower(), f"hint key {key!r} must be lowercase for matching"


class TestReasons:
    def test_reasons_track_candidates(self, fake_keyring):
        ticket = {
            "summary": "Time card pay adjustment bug",
            "description": "",
            "labels": ["Payroll"],
            "components": [{"name": "Sync"}],
        }
        tables, reasons = infer_sql_tables_with_reasons(ticket)
        assert len(tables) == len(reasons)
        # Domain term reasons present.
        assert any(r.startswith("domain_term:") for r in reasons)
        # Label reason present (label "Payroll" is preserved before the
        # "payroll" domain hint, so the source recorded is the label).
        assert any(r.startswith("label:Payroll") for r in reasons)
        # Component "Sync" is unique so its reason should survive.
        assert any(r.startswith("component:Sync") for r in reasons)

    def test_reasons_omit_full_ticket_text(self, fake_keyring):
        long_text = "a" * 5000
        ticket = {"summary": long_text, "description": "", "labels": [], "components": []}
        _tables, reasons = infer_sql_tables_with_reasons(ticket)
        for r in reasons:
            assert long_text not in r


class TestAllowlistFiltering:
    def test_no_allowlist_returns_all(self, fake_keyring):
        ticket = {
            "summary": "TimeCard PayAdjustment Employee",
            "description": "",
            "labels": [],
            "components": [],
        }
        tables = infer_sql_tables(ticket)
        assert len(tables) >= 2

    def test_allowlist_filters_case_insensitively(self, fake_keyring):
        # Configure an allowlist that only includes TimeCard.
        fake_keyring.set_password(
            "testdeck", "sql_server_table_allowlist", "TIMECARD"
        )
        from config.settings import get_settings
        get_settings.cache_clear()

        ticket = {
            "summary": "TimeCard PayAdjustment Employee bug",
            "description": "",
            "labels": [],
            "components": [],
        }
        tables = infer_sql_tables(ticket)
        # PayAdjustment is filtered out; TimeCard remains regardless of case.
        assert any(t.lower() == "timecard" for t in tables)
        assert not any(t.lower() == "payadjustment" for t in tables)
        assert not any(t.lower() == "employee" for t in tables)

    def test_allowlist_schema_qualified_match(self, fake_keyring):
        fake_keyring.set_password(
            "testdeck", "sql_server_table_allowlist", "dbo.TimeCard"
        )
        from config.settings import get_settings
        get_settings.cache_clear()

        ticket = {
            "summary": "TimeCard PayAdjustment",
            "description": "",
            "labels": [],
            "components": [],
        }
        tables = infer_sql_tables(ticket)
        # Bare-name candidate "TimeCard" should match the schema-qualified entry.
        assert any(t.lower() == "timecard" for t in tables)

    def test_allowlist_excludes_everything_returns_empty(self, fake_keyring):
        fake_keyring.set_password(
            "testdeck", "sql_server_table_allowlist", "OnlyThisTable"
        )
        from config.settings import get_settings
        get_settings.cache_clear()

        ticket = {
            "summary": "TimeCard PayAdjustment",
            "description": "",
            "labels": [],
            "components": [],
        }
        # Inference returns empty rather than blowing up; the caller treats
        # this as a metadata warning.
        assert infer_sql_tables(ticket) == []


class TestPreservedTokenInference:
    def test_pascal_case_still_works(self, fake_keyring):
        ticket = {
            "summary": "Migration breaks TimeCard EmployeeId",
            "description": "",
            "labels": [],
            "components": [],
        }
        tables = infer_sql_tables(ticket)
        assert "TimeCard" in tables

    def test_caps_at_max_tables(self, fake_keyring):
        big_summary = " ".join(f"Entity{i}Item" for i in range(40))
        ticket = {"summary": big_summary, "description": "", "labels": [], "components": []}
        assert len(infer_sql_tables(ticket)) <= 8

    def test_deduplicates_case_insensitively(self, fake_keyring):
        ticket = {
            "summary": "TimeCard timecard TimeCard",
            "description": "",
            "labels": [],
            "components": [],
        }
        tables = infer_sql_tables(ticket)
        lower_count = sum(1 for t in tables if t.lower() == "timecard")
        assert lower_count == 1
