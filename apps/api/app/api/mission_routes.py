from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import MissionCreate, MissionList, MissionRead, MissionUpdate, VehicleRead, WaypointRead
from app.db.models.entities import Mission
from app.db.session import get_db_session
from app.services import mission_service

router = APIRouter(prefix="/missions", tags=["missions"])


def to_mission_read(mission: Mission) -> MissionRead:
    vehicles = [
        VehicleRead(
            id=membership.id,
            vehicle_definition_id=membership.vehicle_definition.id,
            callsign=membership.vehicle_definition.callsign,
            vehicle_type=membership.vehicle_definition.vehicle_type,
            max_speed_mps=membership.vehicle_definition.max_speed_mps,
            cruise_speed_mps=membership.vehicle_definition.cruise_speed_mps,
            battery_capacity=membership.vehicle_definition.battery_capacity,
            telemetry_rate_hz=membership.vehicle_definition.telemetry_rate_hz,
            starting_latitude=membership.starting_latitude,
            starting_longitude=membership.starting_longitude,
            starting_altitude_m=membership.starting_altitude_m,
            configuration=membership.configuration,
        )
        for membership in sorted(mission.vehicle_memberships, key=lambda value: value.vehicle_definition.callsign)
    ]
    return MissionRead(
        id=mission.id,
        name=mission.name,
        description=mission.description,
        scenario_type=mission.scenario_type,
        status=mission.status,
        created_at=mission.created_at,
        updated_at=mission.updated_at,
        vehicles=vehicles,
        waypoints=[WaypointRead.model_validate(item) for item in sorted(mission.waypoints, key=lambda value: value.sequence)],
    )


@router.post("", response_model=MissionRead, status_code=status.HTTP_201_CREATED)
async def create_mission(payload: MissionCreate, session: AsyncSession = Depends(get_db_session)) -> MissionRead:
    mission = await mission_service.create_mission(session, payload)
    return to_mission_read(mission)


@router.get("", response_model=MissionList)
async def list_missions(
    limit: int = Query(default=50, ge=1, le=100), cursor: str | None = Query(default=None), session: AsyncSession = Depends(get_db_session)
) -> MissionList:
    try:
        missions, next_cursor = await mission_service.list_missions(session, limit, cursor)
        return MissionList(items=[to_mission_read(mission) for mission in missions], next_cursor=next_cursor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{mission_id}", response_model=MissionRead)
async def get_mission(mission_id: UUID, session: AsyncSession = Depends(get_db_session)) -> MissionRead:
    try:
        return to_mission_read(await mission_service.get_mission(session, mission_id))
    except mission_service.MissionNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission not found") from exc


@router.patch("/{mission_id}", response_model=MissionRead)
async def update_mission(
    mission_id: UUID, payload: MissionUpdate, session: AsyncSession = Depends(get_db_session)
) -> MissionRead:
    try:
        mission = await mission_service.update_mission(session, mission_id, payload)
        return to_mission_read(mission)
    except mission_service.MissionNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission not found") from exc
    except mission_service.MissionConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/{mission_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mission(mission_id: UUID, session: AsyncSession = Depends(get_db_session)) -> Response:
    try:
        await mission_service.delete_mission(session, mission_id)
    except mission_service.MissionNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission not found") from exc
    except mission_service.MissionConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
