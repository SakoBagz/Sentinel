import secrets
from datetime import datetime, timezone
from uuid import UUID

from app.config import get_settings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.schemas import RunCreate
from app.db.models.entities import (
    Mission,
    MissionEvent,
    MissionVehicle,
    RunVehicle,
    SimulationRun,
)
from app.domain.enums import EventSeverity, EventType, MissionStatus, RunStatus
from app.services import mission_service
from app.services.public_limits import ensure_run_allowed
from sentinel_sim.models import MissionConfiguration, SimulationEvent, VehicleConfiguration, WaypointConfiguration, deterministic_id
from sentinel_sim.navigation import Position
from sentinel_sim.network import NetworkConfiguration
from app.realtime.redis import redis_client
from app.realtime.streams import publish_event


class RunNotFound(Exception):
    pass


class RunConflict(Exception):
    pass


async def _record_lifecycle_event(session: AsyncSession, run: SimulationRun, event_type: EventType, sim_time_ms: int) -> SimulationEvent:
    event = SimulationEvent(
        mission_id=run.mission_id,
        run_id=run.id,
        event_type=event_type,
        severity=EventSeverity.INFO,
        sim_time_ms=sim_time_ms,
        payload={"run_status": run.status.value},
        event_id=deterministic_id(run.id, event_type.value, 0),
    )
    session.add(
        MissionEvent(
            id=event.event_id,
            run_id=event.run_id,
            vehicle_id=None,
            event_type=event.event_type,
            severity=event.severity,
            schema_version=event.schema_version,
            sim_time_ms=event.sim_time_ms,
            timestamp=event.timestamp,
            payload=event.payload,
        )
    )
    return event


def _mission_to_simulation(mission: Mission, run: SimulationRun) -> MissionConfiguration:
    run_vehicle_by_definition = {run_vehicle.vehicle_definition_id: run_vehicle for run_vehicle in run.run_vehicles}
    run_vehicle_by_mission_vehicle = {
        membership.vehicle_definition_id: run_vehicle_by_definition[membership.vehicle_definition_id].id
        for membership in mission.vehicle_memberships
    }
    vehicle_configs = []
    for membership in sorted(mission.vehicle_memberships, key=lambda item: item.id.hex):
        run_vehicle = run_vehicle_by_definition[membership.vehicle_definition_id]
        definition = membership.vehicle_definition
        vehicle_configs.append(
            VehicleConfiguration(
                id=run_vehicle.id,
                callsign=definition.callsign,
                vehicle_type=definition.vehicle_type,
                max_speed_mps=definition.max_speed_mps,
                cruise_speed_mps=definition.cruise_speed_mps,
                battery_capacity=definition.battery_capacity,
                telemetry_rate_hz=definition.telemetry_rate_hz,
                starting_position=Position(
                    membership.starting_latitude if membership.starting_latitude is not None else 34.15,
                    membership.starting_longitude if membership.starting_longitude is not None else -118.24,
                    membership.starting_altitude_m if membership.starting_altitude_m is not None else 100,
                ),
                return_battery_threshold=float(definition.configuration.get("return_battery_threshold", 25.0)),
                configuration=membership.configuration,
            )
        )
    waypoints = []
    for waypoint in sorted(mission.waypoints, key=lambda item: (item.vehicle_id.hex if item.vehicle_id else "", item.sequence)):
        run_vehicle_id = None
        if waypoint.vehicle_id is not None:
            mission_vehicle = next(
                (item for item in mission.vehicle_memberships if item.id == waypoint.vehicle_id), None
            )
            if mission_vehicle is not None:
                run_vehicle_id = run_vehicle_by_mission_vehicle.get(mission_vehicle.vehicle_definition_id)
        waypoints.append(
            WaypointConfiguration(
                id=waypoint.id,
                vehicle_id=run_vehicle_id,
                sequence=waypoint.sequence,
                latitude=waypoint.latitude,
                longitude=waypoint.longitude,
                altitude_m=waypoint.altitude_m,
                target_speed_mps=waypoint.target_speed_mps,
                arrival_radius_m=waypoint.arrival_radius_m or 10.0,
                action=waypoint.action,
            )
        )
    return MissionConfiguration(
        id=mission.id,
        vehicles=tuple(vehicle_configs),
        waypoints=tuple(waypoints),
        duration_limit_ms=int(run.configuration.get("duration_limit_ms", 15 * 60 * 1000)),
    )


def network_profiles_for_run(run: SimulationRun) -> dict[UUID, NetworkConfiguration]:
    """Convert persisted run-scoped network settings into simulator profiles."""
    profiles: dict[UUID, NetworkConfiguration] = {}
    for run_vehicle in run.run_vehicles:
        if run_vehicle.network_profile is not None:
            profile = run_vehicle.network_profile
            profiles[run_vehicle.id] = NetworkConfiguration(
                base_latency_ms=profile.base_latency_ms,
                jitter_ms=profile.jitter_ms,
                packet_loss_percent=profile.packet_loss_percent,
                duplicate_percent=profile.duplicate_percent,
                disconnect_probability=profile.disconnect_probability,
                disconnect_duration_min_ms=profile.disconnect_duration_min_ms,
                disconnect_duration_max_ms=profile.disconnect_duration_max_ms,
            )
            continue
        raw = run_vehicle.configuration.get("network_profile")
        if not isinstance(raw, dict):
            continue
        allowed = {
            key: raw[key]
            for key in (
                "base_latency_ms",
                "jitter_ms",
                "packet_loss_percent",
                "duplicate_percent",
                "disconnect_probability",
                "disconnect_duration_min_ms",
                "disconnect_duration_max_ms",
            )
            if key in raw
        }
        try:
            profiles[run_vehicle.id] = NetworkConfiguration(**allowed)
        except (TypeError, ValueError):
            # Invalid optional profiles should not prevent an otherwise valid run;
            # the API validator and debrief surface can report the configuration.
            continue
    return profiles


async def get_run(session: AsyncSession, run_id: UUID) -> SimulationRun:
    result = await session.execute(
        select(SimulationRun)
        .options(
            selectinload(SimulationRun.run_vehicles).selectinload(RunVehicle.vehicle_definition),
            selectinload(SimulationRun.run_vehicles).selectinload(RunVehicle.network_profile),
            selectinload(SimulationRun.mission)
            .selectinload(Mission.vehicle_memberships)
            .selectinload(MissionVehicle.vehicle_definition),
            selectinload(SimulationRun.mission).selectinload(Mission.waypoints),
        )
        .where(SimulationRun.id == run_id)
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise RunNotFound
    return run


async def create_run(session: AsyncSession, mission_id: UUID, payload: RunCreate, session_id: str = "anonymous") -> SimulationRun:
    mission = await mission_service.get_mission(session, mission_id)
    if not mission.vehicle_memberships:
        raise RunConflict("A mission must have at least one vehicle before it can run")
    try:
        await ensure_run_allowed(session, mission, session_id)
    except ValueError as exc:
        raise RunConflict(str(exc)) from exc
    settings = get_settings()
    duration_minutes = payload.duration_limit_minutes or settings.max_mission_duration_minutes
    if duration_minutes > settings.max_mission_duration_minutes:
        raise RunConflict(f"Mission duration cannot exceed {settings.max_mission_duration_minutes} minutes")
    seed = payload.random_seed if payload.random_seed is not None else secrets.randbelow(2**63 - 1)
    run = SimulationRun(
        mission_id=mission.id,
        status=RunStatus.READY,
        random_seed=seed,
        simulation_speed=payload.simulation_speed,
        configuration={
            "mission_status_at_creation": mission.status.value,
            "duration_limit_ms": duration_minutes * 60 * 1000,
            "session_key": session_id,
        },
    )
    session.add(run)
    await session.flush()
    for membership in sorted(mission.vehicle_memberships, key=lambda item: item.id.hex):
        session.add(
            RunVehicle(
                run_id=run.id,
                vehicle_definition_id=membership.vehicle_definition_id,
                starting_latitude=membership.starting_latitude,
                starting_longitude=membership.starting_longitude,
                starting_altitude_m=membership.starting_altitude_m,
                configuration=membership.configuration,
            )
        )
    mission.status = MissionStatus.READY
    await session.commit()
    return await get_run(session, run.id)


async def start_run(session: AsyncSession, run_id: UUID) -> SimulationRun:
    run = await get_run(session, run_id)
    if run.status is RunStatus.RUNNING:
        return run
    if run.status is not RunStatus.READY:
        raise RunConflict(f"Run cannot start from {run.status.value}")
    run.status = RunStatus.RUNNING
    run.started_at = datetime.now(timezone.utc)
    run.mission.status = MissionStatus.RUNNING
    lifecycle_event = await _record_lifecycle_event(session, run, EventType.MISSION_STARTED, 0)
    await session.commit()
    await publish_event(redis_client, lifecycle_event)
    await session.refresh(run)
    await session.refresh(run.mission)
    from app.realtime.runner import coordinator

    await coordinator.start(run.id)
    return await get_run(session, run_id)


async def pause_run(session: AsyncSession, run_id: UUID) -> SimulationRun:
    run = await get_run(session, run_id)
    if run.status is not RunStatus.RUNNING:
        raise RunConflict(f"Run cannot pause from {run.status.value}")
    from app.realtime.runner import coordinator

    await coordinator.pause(run_id)
    run.status = RunStatus.PAUSED
    run.mission.status = MissionStatus.PAUSED
    lifecycle_event = await _record_lifecycle_event(session, run, EventType.MISSION_PAUSED, coordinator.current_time_ms(run_id))
    await session.commit()
    await publish_event(redis_client, lifecycle_event)
    return await get_run(session, run_id)


async def resume_run(session: AsyncSession, run_id: UUID) -> SimulationRun:
    run = await get_run(session, run_id)
    if run.status is not RunStatus.PAUSED:
        raise RunConflict(f"Run cannot resume from {run.status.value}")
    from app.realtime.runner import coordinator

    run.status = RunStatus.RUNNING
    run.mission.status = MissionStatus.RUNNING
    lifecycle_event = await _record_lifecycle_event(session, run, EventType.MISSION_RESUMED, coordinator.current_time_ms(run_id))
    await session.commit()
    await publish_event(redis_client, lifecycle_event)
    await coordinator.resume(run_id)
    return await get_run(session, run_id)


async def stop_run(session: AsyncSession, run_id: UUID) -> SimulationRun:
    run = await get_run(session, run_id)
    if run.status not in {RunStatus.READY, RunStatus.RUNNING, RunStatus.PAUSED}:
        raise RunConflict(f"Run cannot stop from {run.status.value}")
    from app.realtime.runner import coordinator

    run.status = RunStatus.ABORTED
    run.completed_at = datetime.now(timezone.utc)
    run.mission.status = MissionStatus.ABORTED
    lifecycle_event = await _record_lifecycle_event(session, run, EventType.MISSION_ABORTED, coordinator.current_time_ms(run_id))
    await session.commit()
    await publish_event(redis_client, lifecycle_event)
    await coordinator.stop(run_id)
    return await get_run(session, run_id)
