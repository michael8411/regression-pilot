from typing import Literal, Any

from pydantic import BaseModel, EmailStr, Field, HttpUrl, SecretStr


class TicketKeysRequest(BaseModel):
    keys: list[str]


class GenerateRequest(BaseModel):
    tickets: list[dict]
    instructions: str = ""


class GroupTicketsRequest(BaseModel):
    tickets: list[dict]


class ChatRequest(BaseModel):
    messages: list[dict]
    tickets: list[dict] | None = None


class PushTestCasesRequest(BaseModel):
    project_key: str
    test_cases: list[dict]
    folder_id: int | None = None


class PreferencesUpdateRequest(BaseModel):
    theme: Literal["dark", "light", "system"] | None = None
    project_scope: list[str] | None = None
    default_version_status: Literal["unreleased", "released", "all"] | None = None
    auto_select_tickets: bool | None = None
    default_zephyr_folder: int | None = None
    ai_model: str | None = None
    ai_temperature: float | None = Field(default=None, ge=0.0, le=1.0)
    export_format: Literal["json", "csv", "markdown"] | None = None


class CredentialsUpdateRequest(BaseModel):
    jira_base_url: HttpUrl | None = None
    jira_email: EmailStr | None = None
    jira_api_token: SecretStr | None = None
    gemini_api_key: SecretStr | None = None
    zephyr_base_url: HttpUrl | None = None
    zephyr_api_token: SecretStr | None = None

class CreateSessionRequest(BaseModel):
    project_key: str
    version_name: str | None = None

class SaveStateRequest(BaseModel):
    key: str | None = None
    value: Any | None = None
    items: dict[str, Any] | None = None