from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import RunCreate, RunRead, RunVehicleRead
from app.auth import AuthPrincipal, require_operator
from app.db.models.entities import SimulationRun
from app.db.session import get_db_session
from app.services import audit_service, mission_service, run_service
from app.services.public_limits import session_key_from_subject

router = APIRouter(tags=["runs"])


def to_run_read(run: SimulationRun) -> RunRead:
    return RunRead(
        id=run.id,
        mission_id=run.mission_id,
        status=run.status,
        random_seed=run.random_seed,
        simulation_speed=run.simulation_speed,
        configuration=run.configuration,
        started_at=run.started_at,
        completed_at=run.completed_at,
        created_at=run.created_at,
        vehicles=[
            RunVehicleRead(
                id=item.id,
                vehicle_definition_id=item.vehicle_definition_id,
                callsign=item.vehicle_definition.callsign,
                starting_latitude=item.starting_latitude,
                starting_longitude=item.starting_longitude,
                starting_altitude_m=item.starting_altitude_m,
            )
            for item in run.run_vehicles
        ],
    )


@router.post("/missions/{mission_id}/runs", response_model=RunRead, status_code=201)
async def create_run(
    mission_id: UUID,
    payload: RunCreate,
    session: AsyncSession = Depends(get_db_session),
    principal: AuthPrincipal = Depends(require_operator),
) -> RunRead:
    try:
        run = await run_service.create_run(
            session, mission_id, payload, session_key_from_subject(principal.subject)
        )
        await audit_service.record_audit(
            session,
            principal=principal,
            action="run.create",
            resource_type="run",
            resource_id=run.id,
            details={"mission_id": str(mission_id)},
        )
        await session.commit()
        return to_run_read(run)
    except mission_service.MissionNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission not found") from exc
    except run_service.RunConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/runs/{run_id}", response_model=RunRead)
async def get_run(run_id: UUID, session: AsyncSession = Depends(get_db_session)) -> RunRead:
    try:
        return to_run_read(await run_service.get_run(session, run_id))
    except run_service.RunNotFound as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc


@router.get("/runs/{run_id}/vehicles", response_model=list[RunVehicleRead])
async def get_run_vehicles(run_id: UUID, session: AsyncSession = Depends(get_db_session)) -> list[RunVehicleRead]:
    try:
        run = await run_service.get_run(session, run_id)
        return [
            RunVehicleRead(
                id=item.id,
                vehicle_definition_id=item.vehicle_definition_id,
                callsign=item.vehicle_definition.callsign,
                starting_latitude=item.starting_latitude,
                starting_longitude=item.starting_longitude,
                starting_altitude_m=item.starting_altitude_m,
            )
            for item in run.run_vehicles
        ]
    except run_service.RunNotFound as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc


async def _command(
    run_id: UUID,
    action,
    session: AsyncSession,
    principal: AuthPrincipal,
    audit_action: str,
) -> RunRead:
    try:
        run = await action(session, run_id)
        await audit_service.record_audit(
            session,
            principal=principal,
            action=audit_action,
            resource_type="run",
            resource_id=run.id,
            details={"status": run.status.value},
        )
        await session.commit()
        return to_run_read(run)
    except run_service.RunNotFound as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    except run_service.RunConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/runs/{run_id}/start", response_model=RunRead)
async def start_run(
    run_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    principal: AuthPrincipal = Depends(require_operator),
) -> RunRead:
    return await _command(run_id, run_service.start_run, session, principal, "run.start")


@router.post("/runs/{run_id}/pause", response_model=RunRead)
async def pause_run(
    run_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    principal: AuthPrincipal = Depends(require_operator),
) -> RunRead:
    return await _command(run_id, run_service.pause_run, session, principal, "run.pause")


@router.post("/runs/{run_id}/resume", response_model=RunRead)
async def resume_run(
    run_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    principal: AuthPrincipal = Depends(require_operator),
) -> RunRead:
    return await _command(run_id, run_service.resume_run, session, principal, "run.resume")


@router.post("/runs/{run_id}/stop", response_model=RunRead)
async def stop_run(
    run_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    principal: AuthPrincipal = Depends(require_operator),
) -> RunRead:
    return await _command(run_id, run_service.stop_run, session, principal, "run.stop")
