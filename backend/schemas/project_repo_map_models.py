from typing import Literal

from pydantic import BaseModel, Field


Platform = Literal["github", "azure_devops"]


class ProjectRepoMap(BaseModel):
    id: str
    jira_project: str
    platform: Platform
    org: str = ""
    repo: str = ""
    ado_project: str | None = None
    created_at: str
    updated_at: str


class ProjectRepoMapCreate(BaseModel):
    jira_project: str = Field(..., min_length=1)
    platform: Platform
    org: str = ""
    repo: str = ""
    ado_project: str | None = None


class ProjectRepoMapUpdate(BaseModel):
    platform: Platform | None = None
    org: str | None = None
    repo: str | None = None
    ado_project: str | None = None
