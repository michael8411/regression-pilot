from pydantic import BaseModel


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
