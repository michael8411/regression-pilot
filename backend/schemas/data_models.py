from pydantic import BaseModel, Field, field_validator


class DataWipeRequest(BaseModel):
    confirmation: str = Field(..., min_length=1, max_length=64)
    keepCredentials: bool = True

    @field_validator("confirmation")
    @classmethod
    def _confirm(cls, v: str) -> str:
        if v.strip().upper() != "WIPE":
            raise ValueError("confirmation must be the word WIPE")
        return v
