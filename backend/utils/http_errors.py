from fastapi import HTTPException


def upstream_error(system_name: str, error: Exception) -> HTTPException:
    return HTTPException(status_code=502, detail=f"{system_name} error: {str(error)}")
