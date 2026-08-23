from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import PatternGenerateRequest, WaypointCreate, WaypointRead, WaypointUpdate
from app.auth import AuthPrincipal, require_operator
from app.db.session import get_db_session
from app.services import audit_service, mission_service, pattern_service

router = APIRouter(tags=["waypoints"])


@router.post("/missions/{mission_id}/waypoints", response_model=WaypointRead, status_code=status.HTTP_201_CREATED)
async def add_waypoint(
    mission_id: UUID,
    payload: WaypointCreate,
    session: AsyncSession = Depends(get_db_session),
    principal: AuthPrincipal = Depends(require_operator),
) -> WaypointRead:
    try:
        waypoint = await mission_service.add_waypoint(session, mission_id, payload)
        await audit_service.record_audit(
            session,
            principal=principal,
            action="waypoint.add",
            resource_type="mission",
            resource_id=mission_id,
            details={"waypoint_id": str(waypoint.id)},
        )
        await session.commit()
        return WaypointRead.model_validate(waypoint)
    except mission_service.MissionNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission not found") from exc
    except mission_service.VehicleNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission vehicle not found") from exc
    except mission_service.MissionConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/missions/{mission_id}/patterns", response_model=list[WaypointRead], status_code=status.HTTP_201_CREATED)
async def generate_pattern(
    mission_id: UUID,
    payload: PatternGenerateRequest,
    session: AsyncSession = Depends(get_db_session),
    principal: AuthPrincipal = Depends(require_operator),
) -> list[WaypointRead]:
    try:
        waypoints = await pattern_service.apply_search_pattern(session, mission_id, payload)
        await audit_service.record_audit(
            session,
            principal=principal,
            action="pattern.generate",
            resource_type="mission",
            resource_id=mission_id,
            details={"pattern": payload.pattern, "count": len(waypoints)},
        )
        await session.commit()
        return [WaypointRead.model_validate(item) for item in waypoints]
    except mission_service.MissionNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission not found") from exc
    except mission_service.VehicleNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission vehicle not found") from exc
    except mission_service.MissionConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/waypoints/{waypoint_id}", response_model=WaypointRead)
async def update_waypoint(
    waypoint_id: UUID,
    payload: WaypointUpdate,
    session: AsyncSession = Depends(get_db_session),
    principal: AuthPrincipal = Depends(require_operator),
) -> WaypointRead:
    try:
        waypoint = await mission_service.update_waypoint(session, waypoint_id, payload)
        await audit_service.record_audit(
            session,
            principal=principal,
            action="waypoint.update",
            resource_type="waypoint",
            resource_id=waypoint_id,
        )
        await session.commit()
        return WaypointRead.model_validate(waypoint)
    except mission_service.WaypointNotFound as exc:
        raise HTTPException(status_code=404, detail="Waypoint not found") from exc
    except mission_service.VehicleNotFound as exc:
        raise HTTPException(status_code=404, detail="Mission vehicle not found") from exc
    except mission_service.MissionConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/waypoints/{waypoint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_waypoint(
    waypoint_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    principal: AuthPrincipal = Depends(require_operator),
) -> Response:
    try:
        await mission_service.delete_waypoint(session, waypoint_id)
        await audit_service.record_audit(
            session,
            principal=principal,
            action="waypoint.delete",
            resource_type="waypoint",
            resource_id=waypoint_id,
        )
        await session.commit()
    except mission_service.WaypointNotFound as exc:
        raise HTTPException(status_code=404, detail="Waypoint not found") from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
