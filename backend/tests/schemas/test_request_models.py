"""Validation tests for request models."""

import pytest
from pydantic import SecretStr, ValidationError

from schemas.request_models import (
    ChatRequest,
    CredentialsUpdateRequest,
    GenerateRequest,
    GroupTicketsRequest,
    PreferencesUpdateRequest,
    PushTestCasesRequest,
    TicketKeysRequest,
)


class TestPreferencesUpdateRequest:

    def test_empty_payload_is_valid(self):
        """All fields are optional — an empty dict should pass validation."""
        model = PreferencesUpdateRequest()
        assert model.model_dump(exclude_none=True) == {}

    def test_valid_full_payload(self):
        model = PreferencesUpdateRequest(
            theme="light",
            project_scope=["FM", "E360"],
            default_version_status="all",
            auto_select_tickets=False,
            default_zephyr_folder=42,
            ai_model="gemini-2.5-pro",
            ai_temperature=0.5,
            export_format="csv",
        )
        dumped = model.model_dump(exclude_none=True)
        assert dumped["theme"] == "light"
        assert dumped["project_scope"] == ["FM", "E360"]
        assert dumped["ai_temperature"] == 0.5

    @pytest.mark.parametrize("bad_theme", ["neon", "", "LIGHT", "auto"])
    def test_invalid_theme_rejected(self, bad_theme):
        with pytest.raises(ValidationError):
            PreferencesUpdateRequest(theme=bad_theme)

    @pytest.mark.parametrize("valid_theme", ["dark", "light", "system"])
    def test_all_allowed_themes(self, valid_theme):
        model = PreferencesUpdateRequest(theme=valid_theme)
        assert model.theme == valid_theme

    @pytest.mark.parametrize("bad_status", ["UNRELEASED", "pending", "archived"])
    def test_invalid_version_status_rejected(self, bad_status):
        with pytest.raises(ValidationError):
            PreferencesUpdateRequest(default_version_status=bad_status)

    @pytest.mark.parametrize("bad_temp", [-0.01, 1.01, 2.0, -1.0])
    def test_ai_temperature_out_of_range_rejected(self, bad_temp):
        with pytest.raises(ValidationError):
            PreferencesUpdateRequest(ai_temperature=bad_temp)

    @pytest.mark.parametrize("ok_temp", [0.0, 0.3, 0.5, 1.0])
    def test_ai_temperature_boundaries_accepted(self, ok_temp):
        model = PreferencesUpdateRequest(ai_temperature=ok_temp)
        assert model.ai_temperature == ok_temp

    @pytest.mark.parametrize("bad_fmt", ["xml", "yaml", "pdf"])
    def test_invalid_export_format_rejected(self, bad_fmt):
        with pytest.raises(ValidationError):
            PreferencesUpdateRequest(export_format=bad_fmt)


class TestCredentialsUpdateRequest:

    def test_empty_payload_is_valid(self):
        model = CredentialsUpdateRequest()
        assert model.model_dump(exclude_none=True) == {}

    def test_all_valid_fields(self):
        model = CredentialsUpdateRequest(
            jira_base_url="https://hcss.atlassian.net/",
            jira_email="qa@hcss.com",
            jira_api_token="atatt-abcdef",
            gemini_api_key="AIzaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
            zephyr_base_url="https://api.zephyrscale.smartbear.com/v2",
            zephyr_api_token="zephyr-token",
        )
        assert model.jira_email == "qa@hcss.com"
        assert isinstance(model.jira_api_token, SecretStr)
        assert model.jira_api_token.get_secret_value() == "atatt-abcdef"

    @pytest.mark.parametrize("bad_url", ["not-a-url", "javascript:alert(1)", "foo bar"])
    def test_invalid_jira_base_url_rejected(self, bad_url):
        with pytest.raises(ValidationError):
            CredentialsUpdateRequest(jira_base_url=bad_url)

    @pytest.mark.parametrize(
        "bad_email", ["not-an-email", "@missinglocal.com", "no-at-sign.com"]
    )
    def test_invalid_email_rejected(self, bad_email):
        with pytest.raises(ValidationError):
            CredentialsUpdateRequest(jira_email=bad_email)

    def test_secret_str_not_leaked_in_repr(self):
        """Defense-in-depth: repr/str of SecretStr must not expose the secret."""
        model = CredentialsUpdateRequest(jira_api_token="super-secret-value")
        assert "super-secret-value" not in repr(model)
        assert "super-secret-value" not in str(model)
        assert model.jira_api_token.get_secret_value() == "super-secret-value"

    def test_model_dump_excludes_none_for_partial_update(self):
        """The endpoint uses exclude_none=True — confirm its shape."""
        model = CredentialsUpdateRequest(jira_email="only-this@hcss.com")
        dumped = model.model_dump(exclude_none=True)
        assert set(dumped.keys()) == {"jira_email"}


class TestSimpleRequestModels:

    def test_ticket_keys_request(self):
        req = TicketKeysRequest(keys=["FM-1", "FM-2"])
        assert req.keys == ["FM-1", "FM-2"]

    def test_ticket_keys_request_rejects_non_list(self):
        with pytest.raises(ValidationError):
            TicketKeysRequest(keys="FM-1")  # type: ignore[arg-type]

    def test_generate_request_default_instructions_is_empty(self):
        req = GenerateRequest(tickets=[{"key": "FM-1"}])
        assert req.instructions == ""

    def test_group_tickets_request_defaults(self):
        req = GroupTicketsRequest(tickets=[])
        assert req.tickets == []

    def test_chat_request_tickets_default_none(self):
        req = ChatRequest(messages=[{"role": "user", "content": "hi"}])
        assert req.tickets is None

    def test_push_test_cases_request_folder_optional(self):
        req = PushTestCasesRequest(
            project_key="FM",
            test_cases=[{"name": "case1"}],
        )
        assert req.folder_id is None

    def test_push_test_cases_request_folder_accepted(self):
        req = PushTestCasesRequest(
            project_key="FM",
            test_cases=[],
            folder_id=7,
        )
        assert req.folder_id == 7
