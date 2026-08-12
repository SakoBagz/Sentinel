from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import WaypointCreate, WaypointRead, WaypointUpdate
from app.db.session import get_db_session
from app.services import mission_service

router = APIRouter(tags=["waypoints"])


@router.post("/missions/{mission_id}/waypoints", response_model=WaypointRead, status_code=status.HTTP_201_CREATED)
async def add_waypoint(
    mission_id: UUID, payload: WaypointCreate, session: AsyncSession = Depends(get_db_session)
) -> WaypointRead:
    try:
        return WaypointRead.model_validate(await mission_service.add_waypoint(session, mission_id, payload))
    except mission_service.MissionNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission not found") from exc
    except mission_service.VehicleNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission vehicle not found") from exc
    except mission_service.MissionConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch("/waypoints/{waypoint_id}", response_model=WaypointRead)
async def update_waypoint(
    waypoint_id: UUID, payload: WaypointUpdate, session: AsyncSession = Depends(get_db_session)
) -> WaypointRead:
    try:
        return WaypointRead.model_validate(await mission_service.update_waypoint(session, waypoint_id, payload))
    except mission_service.WaypointNotFound as exc:
        raise HTTPException(status_code=404, detail="Waypoint not found") from exc
    except mission_service.VehicleNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission vehicle not found") from exc
    except mission_service.MissionConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/waypoints/{waypoint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_waypoint(waypoint_id: UUID, session: AsyncSession = Depends(get_db_session)) -> Response:
    try:
        await mission_service.delete_waypoint(session, waypoint_id)
    except mission_service.WaypointNotFound as exc:
        raise HTTPException(status_code=404, detail="Waypoint not found") from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)

