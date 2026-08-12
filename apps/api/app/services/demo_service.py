from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.schemas import FailureCreate, MissionCreate, RunCreate, VehicleCreate, WaypointCreate
from app.db.models.entities import Mission, MissionVehicle, SimulationRun
from app.domain.enums import FailureType, MissionStatus, RunStatus
from app.services import failure_service, mission_service, run_service

DEMO_SCENARIO = "angeles_forest_survey"
DEMO_NAME = "Angeles Forest Survey"
DEMO_SEED = 20260812


def _demo_vehicle(index: int) -> tuple[str, float, float]:
    return (
        f"UAV-{index:02d}",
        34.145 + (index % 5) * 0.0015,
        -118.250 + (index // 5) * 0.0015,
    )


async def _find_demo_mission(session: AsyncSession) -> Mission | None:
    result = await session.scalar(
        select(Mission.id)
        .where(
            or_(
                Mission.scenario_type == DEMO_SCENARIO,
                Mission.name == DEMO_NAME,
                and_(
                    Mission.scenario_type == "environmental_survey",
                    Mission.name.ilike("%Angeles Forest%"),
                ),
            )
        )
        .order_by(Mission.updated_at.desc())
        .limit(1)
    )
    if result is None:
        return None
    return await _load_mission(session, result)


async def _load_mission(session: AsyncSession, mission_id: UUID) -> Mission:
    result = await session.execute(
        select(Mission)
        .options(
            selectinload(Mission.vehicle_memberships).selectinload(MissionVehicle.vehicle_definition),
            selectinload(Mission.waypoints),
        )
        .execution_options(populate_existing=True)
        .where(Mission.id == mission_id)
    )
    return result.scalar_one()


async def _active_demo_run(session: AsyncSession, mission_id: UUID) -> SimulationRun | None:
    result = await session.scalar(
        select(SimulationRun.id)
        .where(
            SimulationRun.mission_id == mission_id,
            SimulationRun.status.in_((RunStatus.READY, RunStatus.RUNNING, RunStatus.PAUSED)),
        )
        .order_by(SimulationRun.created_at.desc())
        .limit(1)
    )
    return await run_service.get_run(session, result) if result is not None else None


async def _ensure_demo_mission(session: AsyncSession) -> Mission:
    mission = await _find_demo_mission(session)
    if mission is None:
        mission = await mission_service.create_mission(
            session,
            MissionCreate(
                name=DEMO_NAME,
                description="Deterministic benign wildfire and environmental survey scenario.",
                scenario_type=DEMO_SCENARIO,
            ),
        )
    elif mission.status not in {MissionStatus.RUNNING, MissionStatus.PAUSED}:
        # Normalize missions created by the earlier seed script to the canonical
        # scenario identifier without changing an active run's definition.
        if mission.name != DEMO_NAME or mission.scenario_type != DEMO_SCENARIO:
            mission.name = DEMO_NAME
            mission.scenario_type = DEMO_SCENARIO
            await session.commit()

    existing_by_callsign = {
        membership.vehicle_definition.callsign: membership
        for membership in mission.vehicle_memberships
    }
    for index in range(1, 26):
        callsign, latitude, longitude = _demo_vehicle(index)
        if callsign not in existing_by_callsign:
            await mission_service.add_vehicle(
                session,
                mission.id,
                VehicleCreate(
                    callsign=callsign,
                    vehicle_type="SURVEY",
                    max_speed_mps=25,
                    cruise_speed_mps=12,
                    battery_capacity=100,
                    telemetry_rate_hz=5,
                    starting_latitude=latitude,
                    starting_longitude=longitude,
                    starting_altitude_m=100,
                    configuration={
                        "return_battery_threshold": 25,
                        "network_profile": {
                            "base_latency_ms": 50,
                            "jitter_ms": 10,
                            "packet_loss_percent": 1,
                            "duplicate_percent": 0.5,
                        },
                    },
                ),
            )

    mission = await _load_mission(session, mission.id)
    existing_routes = {(waypoint.vehicle_id, waypoint.sequence) for waypoint in mission.waypoints}
    for index in range(1, 26):
        callsign, latitude, longitude = _demo_vehicle(index)
        membership = next(
            item
            for item in mission.vehicle_memberships
            if item.vehicle_definition.callsign == callsign
        )
        for sequence, offset in enumerate((0.008, 0.012, 0.005)):
            if (membership.id, sequence) in existing_routes:
                continue
            await mission_service.add_waypoint(
                session,
                mission.id,
                WaypointCreate(
                    vehicle_id=membership.id,
                    sequence=sequence,
                    latitude=latitude + offset,
                    longitude=longitude + (0.001 if sequence % 2 == 0 else -0.001),
                    altitude_m=110 + sequence * 5,
                    target_speed_mps=12,
                    arrival_radius_m=10,
                    action="SURVEY" if sequence == 1 else "TRANSIT",
                ),
            )
    return await _load_mission(session, mission.id)


async def launch(session: AsyncSession, session_id: str) -> SimulationRun:
    mission = await _find_demo_mission(session)
    if mission is not None:
        active = await _active_demo_run(session, mission.id)
        if active is not None:
            return active
    mission = await _ensure_demo_mission(session)

    run = await run_service.create_run(
        session,
        mission.id,
        RunCreate(random_seed=DEMO_SEED, simulation_speed=1.0, duration_limit_minutes=15),
        session_id,
    )
    run.configuration = {**run.configuration, "demo_scenario": DEMO_SCENARIO}
    await session.commit()
    run = await run_service.start_run(session, run.id)

    run_vehicle_by_callsign = {
        item.vehicle_definition.callsign: item.id for item in run.run_vehicles
    }
    seeded_failures = (
        (
            "UAV-07",
            FailureType.COMMUNICATIONS_BLACKOUT,
            10_000,
            {},
        ),
        (
            "UAV-12",
            FailureType.BATTERY_ANOMALY,
            90_000,
            {"drain_multiplier": 20.0},
        ),
        (
            "UAV-18",
            FailureType.PACKET_LOSS,
            20_000,
            {"packet_loss_percent": 50},
        ),
    )
    for callsign, failure_type, duration_ms, configuration in seeded_failures:
        await failure_service.inject_failure(
            session,
            run.id,
            FailureCreate(
                vehicle_id=run_vehicle_by_callsign[callsign],
                failure_type=failure_type,
                duration_ms=duration_ms,
                configuration=configuration,
            ),
        )
    return await run_service.get_run(session, run.id)
