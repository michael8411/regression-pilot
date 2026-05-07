from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class ThemeSpec(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=128)
    ticketKeys: List[str] = Field(default_factory=list)


class CycleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=4000)
    projectKey: str = Field(min_length=1, max_length=32)
    versionHint: str = Field(default="", max_length=64)
    ticketKeys: List[str] = Field(default_factory=list)
    themes: List[ThemeSpec] = Field(default_factory=list)
    testCaseRefs: List[str] = Field(default_factory=list)
    pinned: bool = False

    @field_validator("ticketKeys")
    @classmethod
    def _bound_keys(cls, v: List[str]) -> List[str]:
        if len(v) > 500:
            raise ValueError("too many ticket keys")
        for k in v:
            if not isinstance(k, str) or len(k) > 64:
                raise ValueError("ticket key invalid")
        return v

    @field_validator("themes")
    @classmethod
    def _bound_themes(cls, v):
        if len(v) > 50:
            raise ValueError("too many themes")
        return v

    @field_validator("testCaseRefs")
    @classmethod
    def _bound_refs(cls, v):
        if len(v) > 1000:
            raise ValueError("too many test case refs")
        for r in v:
            if not isinstance(r, str) or len(r) > 256:
                raise ValueError("ref too long")
        return v


class CyclePatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    versionHint: Optional[str] = None
    ticketKeys: Optional[List[str]] = None
    themes: Optional[List[ThemeSpec]] = None
    testCaseRefs: Optional[List[str]] = None
    pinned: Optional[bool] = None
    archived: Optional[bool] = None

    @field_validator("ticketKeys")
    @classmethod
    def _bound_keys(cls, v):
        if v is None:
            return v
        if len(v) > 500:
            raise ValueError("too many ticket keys")
        for k in v:
            if not isinstance(k, str) or len(k) > 64:
                raise ValueError("ticket key invalid")
        return v

    @field_validator("themes")
    @classmethod
    def _bound_themes(cls, v):
        if v is None:
            return v
        if len(v) > 50:
            raise ValueError("too many themes")
        return v


class CycleSummary(BaseModel):
    id: str
    name: str
    projectKey: str
    versionHint: str
    ticketCount: int
    themeCount: int
    pinned: bool
    archived: bool
    lastRunAt: Optional[str] = None
    runCount: int
    updatedAt: str


class Cycle(CycleSummary):
    description: str
    ticketKeys: List[str]
    themes: List[ThemeSpec]
    testCaseRefs: List[str]
    createdAt: str


CycleRunStatus = Literal[
    "started", "session_created", "abandoned", "completed", "failed"
]


class CycleRun(BaseModel):
    id: str
    cycleId: str
    sessionId: Optional[str] = None
    startedAt: str
    finishedAt: Optional[str] = None
    status: CycleRunStatus
    notes: str


class CycleRunRequest(BaseModel):
    sessionName: Optional[str] = None


class CycleRunPatch(BaseModel):
    status: Optional[CycleRunStatus] = None
    finishedAt: Optional[str] = None
    notes: Optional[str] = None
