from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import VehicleCreate, VehicleRead
from app.db.models.entities import MissionVehicle
from app.db.session import get_db_session
from app.services import mission_service

router = APIRouter(prefix="/missions/{mission_id}/vehicles", tags=["vehicles"])


def to_vehicle_read(membership: MissionVehicle) -> VehicleRead:
    definition = membership.vehicle_definition
    return VehicleRead(
        id=membership.id,
        vehicle_definition_id=definition.id,
        callsign=definition.callsign,
        vehicle_type=definition.vehicle_type,
        max_speed_mps=definition.max_speed_mps,
        cruise_speed_mps=definition.cruise_speed_mps,
        battery_capacity=definition.battery_capacity,
        telemetry_rate_hz=definition.telemetry_rate_hz,
        starting_latitude=membership.starting_latitude,
        starting_longitude=membership.starting_longitude,
        starting_altitude_m=membership.starting_altitude_m,
        configuration=membership.configuration,
    )


@router.post("", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
async def add_vehicle(
    mission_id: UUID, payload: VehicleCreate, session: AsyncSession = Depends(get_db_session)
) -> VehicleRead:
    try:
        return to_vehicle_read(await mission_service.add_vehicle(session, mission_id, payload))
    except mission_service.MissionNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission not found") from exc
    except mission_service.MissionConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("", response_model=list[VehicleRead])
async def list_vehicles(mission_id: UUID, session: AsyncSession = Depends(get_db_session)) -> list[VehicleRead]:
    try:
        memberships = await mission_service.list_vehicles(session, mission_id)
        return [to_vehicle_read(membership) for membership in memberships]
    except mission_service.MissionNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission not found") from exc


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_vehicle(
    mission_id: UUID, vehicle_id: UUID, session: AsyncSession = Depends(get_db_session)
) -> Response:
    try:
        await mission_service.remove_vehicle(session, mission_id, vehicle_id)
    except mission_service.MissionNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission not found") from exc
    except mission_service.VehicleNotFound as exc:
        raise HTTPException(status_code=404, detail="Vehicle not found") from exc
    except mission_service.MissionConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
