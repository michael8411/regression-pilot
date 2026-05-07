from fastapi import APIRouter, HTTPException, Query

try:
    from backend.schemas.cycle_models import (
        Cycle,
        CycleCreate,
        CyclePatch,
        CycleRun,
        CycleRunPatch,
        CycleRunRequest,
        CycleSummary,
    )
    from backend.services import cycle_service as svc
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from schemas.cycle_models import (
        Cycle,
        CycleCreate,
        CyclePatch,
        CycleRun,
        CycleRunPatch,
        CycleRunRequest,
        CycleSummary,
    )
    from services import cycle_service as svc


router = APIRouter(prefix="/cycles", tags=["cycles"])


@router.get("", response_model=list[CycleSummary])
async def list_cycles(
    includeArchived: bool = Query(False, alias="includeArchived"),
):
    return await svc.list_cycles(include_archived=includeArchived)


@router.post("", response_model=Cycle)
async def create_cycle(payload: CycleCreate):
    return await svc.create_cycle(payload)


@router.get("/{cid}", response_model=Cycle)
async def get_cycle(cid: str):
    cycle = await svc.get_cycle(cid)
    if not cycle:
        raise HTTPException(404, "cycle_not_found")
    return cycle


@router.patch("/{cid}", response_model=Cycle)
async def patch_cycle(cid: str, payload: CyclePatch):
    cycle = await svc.patch_cycle(cid, payload)
    if not cycle:
        raise HTTPException(404, "cycle_not_found")
    return cycle


@router.delete("/{cid}")
async def delete_cycle(cid: str):
    deleted = await svc.delete_cycle(cid)
    if not deleted:
        raise HTTPException(404, "cycle_not_found")
    return {"deleted": True}


@router.post("/{cid}/duplicate", response_model=Cycle)
async def duplicate_cycle(cid: str):
    copy = await svc.duplicate_cycle(cid)
    if not copy:
        raise HTTPException(404, "cycle_not_found")
    return copy


@router.post("/{cid}/run", response_model=CycleRun)
async def run_cycle(cid: str, payload: CycleRunRequest):
    run = await svc.run_cycle(cid, session_name=payload.sessionName)
    if not run:
        raise HTTPException(404, "cycle_not_found")
    return run


@router.get("/{cid}/runs", response_model=list[CycleRun])
async def list_runs(cid: str):
    return await svc.list_runs(cid)


@router.patch("/{cid}/runs/{run_id}", response_model=CycleRun)
async def patch_run(cid: str, run_id: str, payload: CycleRunPatch):
    run = await svc.patch_run(cid, run_id, payload)
    if not run:
        raise HTTPException(404, "cycle_run_not_found")
    return run
