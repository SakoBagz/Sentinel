from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import PatternGenerateRequest, WaypointCreate
from app.domain.enums import WaypointAction
from app.services import mission_service
from sentinel_sim.patterns import expanding_square_pattern, lawnmower_pattern


async def apply_search_pattern(
    session: AsyncSession,
    mission_id: UUID,
    payload: PatternGenerateRequest,
):
    mission = await mission_service.get_mission(session, mission_id)
    if not any(item.id == payload.vehicle_id for item in mission.vehicle_memberships):
        raise mission_service.VehicleNotFound("Mission vehicle not found")

    if payload.pattern == "lawnmower":
        points = lawnmower_pattern(
            center_latitude=payload.center_latitude,
            center_longitude=payload.center_longitude,
            altitude_m=payload.altitude_m,
            spacing_m=payload.spacing_m,
            legs=payload.legs,
            leg_length_m=payload.leg_length_m,
        )
    else:
        points = expanding_square_pattern(
            center_latitude=payload.center_latitude,
            center_longitude=payload.center_longitude,
            altitude_m=payload.altitude_m,
            spacing_m=payload.spacing_m,
            legs=payload.legs,
        )

    vehicle_waypoints = [wp for wp in mission.waypoints if wp.vehicle_id == payload.vehicle_id]
    next_sequence = max((wp.sequence for wp in vehicle_waypoints), default=-1) + 1

    created = []
    for point in points:
        waypoint = await mission_service.add_waypoint(
            session,
            mission_id,
            WaypointCreate(
                vehicle_id=payload.vehicle_id,
                sequence=next_sequence + point.sequence,
                latitude=point.latitude,
                longitude=point.longitude,
                altitude_m=point.altitude_m,
                target_speed_mps=payload.target_speed_mps,
                arrival_radius_m=25.0,
                action=WaypointAction.SURVEY if point.sequence > 0 else WaypointAction.TRANSIT,
            ),
        )
        created.append(waypoint)
    return created
