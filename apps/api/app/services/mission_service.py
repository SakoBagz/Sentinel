import base64
from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import Select

from app.api.schemas import MissionCreate, MissionUpdate, VehicleCreate, WaypointCreate, WaypointUpdate
from app.db.models.entities import Mission, MissionVehicle, VehicleDefinition, Waypoint
from app.domain.enums import MissionStatus
from app.services.public_limits import ensure_vehicle_allowed


class MissionNotFound(Exception):
    pass


class VehicleNotFound(Exception):
    pass


class WaypointNotFound(Exception):
    pass


class MissionConflict(Exception):
    pass


async def _mission_query() -> Select[tuple[Mission]]:
    return select(Mission).options(
        selectinload(Mission.vehicle_memberships).selectinload(MissionVehicle.vehicle_definition),
        selectinload(Mission.waypoints),
    )


async def get_mission(session: AsyncSession, mission_id: UUID) -> Mission:
    result = await session.execute((await _mission_query()).where(Mission.id == mission_id))
    mission = result.scalar_one_or_none()
    if mission is None:
        raise MissionNotFound
    return mission


def _encode_mission_cursor(mission: Mission) -> str:
    value = f"{mission.updated_at.isoformat()}|{mission.id}"
    return base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")


def _decode_mission_cursor(cursor: str) -> tuple[datetime, UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        timestamp, mission_id = base64.urlsafe_b64decode(padded.encode()).decode().split("|", 1)
        return datetime.fromisoformat(timestamp), UUID(mission_id)
    except (ValueError, TypeError, UnicodeDecodeError) as exc:
        raise ValueError("Invalid mission cursor") from exc


async def list_missions(session: AsyncSession, limit: int = 50, cursor: str | None = None) -> tuple[Sequence[Mission], str | None]:
    query = (await _mission_query()).order_by(Mission.updated_at.desc(), Mission.id.desc())
    if cursor is not None:
        updated_at, mission_id = _decode_mission_cursor(cursor)
        query = query.where(
            or_(Mission.updated_at < updated_at, and_(Mission.updated_at == updated_at, Mission.id < mission_id))
        )
    result = await session.execute(query.limit(limit + 1))
    missions = list(result.scalars().all())
    next_cursor = None
    if len(missions) > limit:
        missions.pop()
        next_cursor = _encode_mission_cursor(missions[-1])
    return missions, next_cursor


async def create_mission(session: AsyncSession, payload: MissionCreate) -> Mission:
    mission = Mission(
        name=payload.name,
        description=payload.description,
        scenario_type=payload.scenario_type,
        status=MissionStatus.DRAFT,
    )
    session.add(mission)
    await session.commit()
    return await get_mission(session, mission.id)


async def update_mission(session: AsyncSession, mission_id: UUID, payload: MissionUpdate) -> Mission:
    mission = await get_mission(session, mission_id)
    if mission.status in {MissionStatus.RUNNING, MissionStatus.PAUSED}:
        raise MissionConflict("Active missions cannot be edited")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(mission, field, value)
    await session.commit()
    return await get_mission(session, mission_id)


async def delete_mission(session: AsyncSession, mission_id: UUID) -> None:
    mission = await get_mission(session, mission_id)
    if mission.runs:
        raise MissionConflict("A mission with simulation history cannot be deleted")
    await session.delete(mission)
    await session.commit()


async def add_vehicle(session: AsyncSession, mission_id: UUID, payload: VehicleCreate) -> MissionVehicle:
    mission = await get_mission(session, mission_id)
    if mission.status in {MissionStatus.RUNNING, MissionStatus.PAUSED}:
        raise MissionConflict("Vehicles cannot be changed during an active run")
    try:
        await ensure_vehicle_allowed(session, mission_id, payload.telemetry_rate_hz)
    except ValueError as exc:
        raise MissionConflict(str(exc)) from exc
    duplicate = await session.scalar(select(VehicleDefinition).where(VehicleDefinition.callsign == payload.callsign))
    if duplicate is not None:
        existing = await session.scalar(
            select(MissionVehicle).where(
                MissionVehicle.mission_id == mission_id,
                MissionVehicle.vehicle_definition_id == duplicate.id,
            )
        )
        if existing is not None:
            raise MissionConflict("The callsign is already assigned to this mission")
        definition = duplicate
    else:
        definition = VehicleDefinition(
            callsign=payload.callsign,
            vehicle_type=payload.vehicle_type,
            max_speed_mps=payload.max_speed_mps,
            cruise_speed_mps=payload.cruise_speed_mps,
            battery_capacity=payload.battery_capacity,
            telemetry_rate_hz=payload.telemetry_rate_hz,
            configuration=payload.configuration,
        )
        session.add(definition)
        await session.flush()
    membership = MissionVehicle(
        mission_id=mission_id,
        vehicle_definition_id=definition.id,
        starting_latitude=payload.starting_latitude,
        starting_longitude=payload.starting_longitude,
        starting_altitude_m=payload.starting_altitude_m,
        configuration=payload.configuration,
    )
    session.add(membership)
    await session.commit()
    result = await session.execute(
        select(MissionVehicle)
        .options(selectinload(MissionVehicle.vehicle_definition))
        .where(MissionVehicle.id == membership.id)
    )
    return result.scalar_one()


async def list_vehicles(session: AsyncSession, mission_id: UUID) -> Sequence[MissionVehicle]:
    await get_mission(session, mission_id)
    result = await session.execute(
        select(MissionVehicle)
        .options(selectinload(MissionVehicle.vehicle_definition))
        .where(MissionVehicle.mission_id == mission_id)
        .order_by(MissionVehicle.id)
    )
    return result.scalars().all()


async def remove_vehicle(session: AsyncSession, mission_id: UUID, vehicle_id: UUID) -> None:
    mission = await get_mission(session, mission_id)
    if mission.status in {MissionStatus.RUNNING, MissionStatus.PAUSED}:
        raise MissionConflict("Vehicles cannot be changed during an active run")
    membership = await session.scalar(
        select(MissionVehicle).where(MissionVehicle.id == vehicle_id, MissionVehicle.mission_id == mission_id)
    )
    if membership is None:
        raise VehicleNotFound
    waypoint_count = await session.scalar(select(Waypoint.id).where(Waypoint.vehicle_id == vehicle_id).limit(1))
    if waypoint_count is not None:
        raise MissionConflict("Remove the vehicle route before removing the vehicle")
    await session.delete(membership)
    await session.commit()


async def add_waypoint(session: AsyncSession, mission_id: UUID, payload: WaypointCreate) -> Waypoint:
    mission = await get_mission(session, mission_id)
    if mission.status in {MissionStatus.RUNNING, MissionStatus.PAUSED}:
        raise MissionConflict("Waypoints cannot be changed during an active run")
    if payload.vehicle_id is not None:
        membership = await session.scalar(
            select(MissionVehicle).where(
                MissionVehicle.id == payload.vehicle_id, MissionVehicle.mission_id == mission_id
            )
        )
        if membership is None:
            raise VehicleNotFound
    duplicate = await session.scalar(
        select(Waypoint).where(
            Waypoint.mission_id == mission_id,
            Waypoint.vehicle_id == payload.vehicle_id,
            Waypoint.sequence == payload.sequence,
        )
    )
    if duplicate is not None:
        raise MissionConflict("Waypoint sequence is already used for this route")
    waypoint = Waypoint(mission_id=mission_id, **payload.model_dump())
    session.add(waypoint)
    await session.commit()
    await session.refresh(waypoint)
    return waypoint


async def update_waypoint(session: AsyncSession, waypoint_id: UUID, payload: WaypointUpdate) -> Waypoint:
    waypoint = await session.get(Waypoint, waypoint_id)
    if waypoint is None:
        raise WaypointNotFound
    mission = await get_mission(session, waypoint.mission_id)
    if mission.status in {MissionStatus.RUNNING, MissionStatus.PAUSED}:
        raise MissionConflict("Waypoints cannot be changed during an active run")
    values = payload.model_dump(exclude_unset=True)
    target_vehicle_id = values.get("vehicle_id", waypoint.vehicle_id)
    target_sequence = values.get("sequence", waypoint.sequence)
    if target_vehicle_id is not None:
        membership = await session.scalar(
            select(MissionVehicle).where(
                MissionVehicle.id == target_vehicle_id, MissionVehicle.mission_id == waypoint.mission_id
            )
        )
        if membership is None:
            raise VehicleNotFound
    duplicate = await session.scalar(
        select(Waypoint).where(
            Waypoint.id != waypoint_id,
            Waypoint.mission_id == waypoint.mission_id,
            Waypoint.vehicle_id == target_vehicle_id,
            Waypoint.sequence == target_sequence,
        )
    )
    if duplicate is not None:
        raise MissionConflict("Waypoint sequence is already used for this route")
    for field, value in values.items():
        setattr(waypoint, field, value)
    await session.commit()
    await session.refresh(waypoint)
    return waypoint


async def delete_waypoint(session: AsyncSession, waypoint_id: UUID) -> None:
    waypoint = await session.get(Waypoint, waypoint_id)
    if waypoint is None:
        raise WaypointNotFound
    mission = await get_mission(session, waypoint.mission_id)
    if mission.status in {MissionStatus.RUNNING, MissionStatus.PAUSED}:
        raise MissionConflict("Waypoints cannot be changed during an active run")
    await session.delete(waypoint)
    await session.commit()
