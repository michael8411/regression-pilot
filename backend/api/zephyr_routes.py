from fastapi import APIRouter

from schemas.request_models import PushTestCasesRequest
from services import zephyr_service
from utils.http_errors import upstream_error

router = APIRouter(prefix="/zephyr", tags=["zephyr"])


@router.get("/folders/{project_key}")
async def list_folders(project_key: str):
    try:
        return await zephyr_service.get_folders(project_key)
    except Exception as e:
        raise upstream_error("Zephyr API", e)


@router.post("/push")
async def push_test_cases(req: PushTestCasesRequest):
    try:
        results = await zephyr_service.create_test_cases_bulk(
            project_key=req.project_key,
            test_cases=req.test_cases,
            folder_id=req.folder_id,
        )
        return {
            "created": len(results),
            "test_cases": results,
        }
    except Exception as e:
        raise upstream_error("Zephyr API", e)
