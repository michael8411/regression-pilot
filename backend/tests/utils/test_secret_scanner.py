"""Tests for secret scanning and redaction helpers."""

from utils.secret_scanner import (
    _PATTERNS,
    _PREVIEW_LENGTH,
    contains_secrets,
    redact_for_external,
    scan_for_secrets,
)


AZURE_SAMPLE = "AccountKey=" + ("A" * 86) + "=="
SQL_PASSWORD_SAMPLE = "Password=MySecret;Initial Catalog=MyDb"
INTERNAL_IP_SAMPLE = "Server at 192.168.1.50 responded"
GOOGLE_KEY_SAMPLE = "key=AIzaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
BENIGN_SAMPLE = "Fix the login button on the work order screen"


class TestDetection:

    def test_azure_storage_key_detected(self):
        findings = scan_for_secrets(AZURE_SAMPLE)
        assert len(findings) == 1
        assert findings[0]["pattern_name"] == "AZURE_STORAGE_KEY"

    def test_sql_connection_detected(self):
        findings = scan_for_secrets(SQL_PASSWORD_SAMPLE)
        assert len(findings) >= 1
        assert all(f["pattern_name"] == "SQL_CONNECTION" for f in findings)

    def test_internal_ip_detected(self):
        findings = scan_for_secrets(INTERNAL_IP_SAMPLE)
        assert len(findings) == 1
        assert findings[0]["pattern_name"] == "INTERNAL_IP"

    def test_google_api_key_detected(self):
        findings = scan_for_secrets(GOOGLE_KEY_SAMPLE)
        assert len(findings) == 1
        assert findings[0]["pattern_name"] == "GOOGLE_API_KEY"

    def test_contains_secrets_true_on_any_match(self):
        for sample in (AZURE_SAMPLE, SQL_PASSWORD_SAMPLE, INTERNAL_IP_SAMPLE, GOOGLE_KEY_SAMPLE):
            assert contains_secrets(sample) is True


class TestNoFalsePositives:

    def test_benign_ticket_body_does_not_match(self):
        assert scan_for_secrets(BENIGN_SAMPLE) == []
        assert contains_secrets(BENIGN_SAMPLE) is False

    def test_public_ip_does_not_match_internal_ip(self):
        """RFC 1918 only — a public IP must not match INTERNAL_IP."""
        assert contains_secrets("reach us at 8.8.8.8 today") is False

    def test_empty_string_is_safe(self):
        assert scan_for_secrets("") == []
        assert contains_secrets("") is False


class TestPreviewHygiene:

    def test_preview_length_cap(self):
        for sample in (AZURE_SAMPLE, SQL_PASSWORD_SAMPLE, INTERNAL_IP_SAMPLE, GOOGLE_KEY_SAMPLE):
            findings = scan_for_secrets(sample)
            assert findings, f"expected at least one finding for sample: {sample!r}"
            for f in findings:
                assert len(f["match_preview"]) <= _PREVIEW_LENGTH

    def test_preview_does_not_leak_full_google_key(self):
        """The Google API key sample is 39 chars — preview must not expose the whole thing."""
        findings = scan_for_secrets(GOOGLE_KEY_SAMPLE)
        assert findings
        full_match = GOOGLE_KEY_SAMPLE.split("=", 1)[1]
        assert findings[0]["match_preview"] != full_match

    def test_preview_does_not_leak_full_azure_key(self):
        findings = scan_for_secrets(AZURE_SAMPLE)
        assert findings
        assert findings[0]["match_preview"] != AZURE_SAMPLE


class TestInputResilience:

    def test_none_input_returns_empty(self):
        assert scan_for_secrets(None) == []  # type: ignore[arg-type]

    def test_int_input_returns_empty(self):
        assert scan_for_secrets(12345) == []  # type: ignore[arg-type]

    def test_list_input_returns_empty(self):
        assert scan_for_secrets([AZURE_SAMPLE]) == []  # type: ignore[arg-type]


class TestRedaction:

    def test_redacts_azure_key(self):
        redacted, findings = redact_for_external(AZURE_SAMPLE)
        assert findings
        assert "[REDACTED]" in redacted
        assert ("A" * 86) not in redacted

    def test_redacts_internal_ip(self):
        redacted, findings = redact_for_external(INTERNAL_IP_SAMPLE)
        assert findings
        assert "192.168.1.50" not in redacted
        assert "[REDACTED]" in redacted
        assert "Server at" in redacted
        assert "responded" in redacted

    def test_no_findings_returns_text_unchanged(self):
        redacted, findings = redact_for_external(BENIGN_SAMPLE)
        assert findings == []
        assert redacted == BENIGN_SAMPLE

    def test_custom_placeholder_is_used(self):
        redacted, _ = redact_for_external(INTERNAL_IP_SAMPLE, placeholder="<SCRUBBED>")
        assert "<SCRUBBED>" in redacted
        assert "192.168.1.50" not in redacted

    def test_multiple_secrets_all_redacted(self):
        text = f"{INTERNAL_IP_SAMPLE} and also {GOOGLE_KEY_SAMPLE}"
        redacted, findings = redact_for_external(text)
        assert len(findings) >= 2
        assert "192.168.1.50" not in redacted
        assert "AIzaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" not in redacted


class TestPatternRegistry:

    def test_pattern_names(self):
        names = {name for name, _ in _PATTERNS}
        assert names == {
            "AZURE_STORAGE_KEY",
            "SQL_CONNECTION",
            "INTERNAL_IP",
            "GOOGLE_API_KEY",
        }
