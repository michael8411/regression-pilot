"""HTTP routes for project -> repo mappings."""
import structlog
from fastapi import APIRouter, HTTPException

try:
    from backend.schemas.project_repo_map_models import (
        ProjectRepoMap,
        ProjectRepoMapCreate,
        ProjectRepoMapUpdate,
    )
    from backend.services.project_repo_map_service import (
        DuplicateProjectError,
        MappingNotFoundError,
        create_mapping,
        delete_mapping,
        list_mappings,
        update_mapping,
    )
except ImportError:  # pragma: no cover
    from schemas.project_repo_map_models import (
        ProjectRepoMap,
        ProjectRepoMapCreate,
        ProjectRepoMapUpdate,
    )
    from services.project_repo_map_service import (
        DuplicateProjectError,
        MappingNotFoundError,
        create_mapping,
        delete_mapping,
        list_mappings,
        update_mapping,
    )


logger = structlog.get_logger("testdeck.project_repo_map_routes")
router = APIRouter(prefix="/repo-map", tags=["repo-map"])


@router.get("", response_model=list[ProjectRepoMap])
async def list_repo_mappings():
    return await list_mappings()


@router.post("", response_model=ProjectRepoMap, status_code=201)
async def add_repo_mapping(req: ProjectRepoMapCreate):
    try:
        return await create_mapping(req)
    except DuplicateProjectError as exc:
        raise HTTPException(
            status_code=409,
            detail=f"Mapping already exists for project '{exc}'",
        )


@router.patch("/{mapping_id}", response_model=ProjectRepoMap)
async def edit_repo_mapping(mapping_id: str, req: ProjectRepoMapUpdate):
    try:
        return await update_mapping(mapping_id, req)
    except MappingNotFoundError:
        raise HTTPException(status_code=404, detail="Mapping not found")


@router.delete("/{mapping_id}")
async def remove_repo_mapping(mapping_id: str):
    deleted = await delete_mapping(mapping_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Mapping not found")
    return {"deleted": True}
