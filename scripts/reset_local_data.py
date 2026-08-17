#!/usr/bin/env python3
"""Reset local Sentinel operational data and seed two usable mission definitions.

This command is intentionally confirmation-gated. It removes all PostgreSQL
operational records and Redis stream state for the configured local environment,
then recreates mission definitions without creating a simulation run.
"""

from __future__ import annotations

import argparse
import asyncio

from app.api.schemas import MissionCreate, VehicleCreate, WaypointCreate
from app.config import get_settings
from app.db.session import SessionFactory, dispose_engine, engine
from app.domain.enums import MissionScenario, WaypointAction
from app.services import mission_service
from redis.asyncio import Redis
from sqlalchemy import text

RESET_TABLES = (
    "debriefs",
    "failure_injections",
    "mission_events",
    "mission_vehicles",
    "missions",
    "network_profiles",
    "run_vehicles",
    "simulation_runs",
    "telemetry_samples",
    "vehicle_definitions",
)


async def reset_storage() -> None:
    table_list = ", ".join(RESET_TABLES)
    async with engine.begin() as connection:
        await connection.execute(text(f"TRUNCATE TABLE {table_list} RESTART IDENTITY CASCADE"))

    redis_client: Redis = Redis.from_url(get_settings().redis_url)
    try:
        await redis_client.flushdb()
    finally:
        await redis_client.aclose()


async def seed_mission(
    *,
    name: str,
    description: str,
    scenario_type: MissionScenario,
    callsigns: tuple[str, ...],
    origin_latitude: float,
    origin_longitude: float,
) -> str:
    async with SessionFactory() as session:
        mission = await mission_service.create_mission(
            session,
            MissionCreate(name=name, description=description, scenario_type=scenario_type),
        )
        for index, callsign in enumerate(callsigns):
            vehicle = await mission_service.add_vehicle(
                session,
                mission.id,
                VehicleCreate(
                    callsign=callsign,
                    vehicle_type="SURVEY",
                    starting_latitude=origin_latitude + index * 0.0012,
                    starting_longitude=origin_longitude + index * 0.0012,
                    starting_altitude_m=100,
                ),
            )
            for sequence, (latitude_offset, longitude_offset, action) in enumerate(
                ((0.006, 0.004, WaypointAction.TRANSIT), (0.011, -0.003, WaypointAction.SURVEY), (0.004, -0.009, WaypointAction.RETURN))
            ):
                await mission_service.add_waypoint(
                    session,
                    mission.id,
                    WaypointCreate(
                        vehicle_id=vehicle.id,
                        sequence=sequence,
                        latitude=origin_latitude + index * 0.0012 + latitude_offset,
                        longitude=origin_longitude + index * 0.0012 + longitude_offset,
                        altitude_m=110 + sequence * 5,
                        target_speed_mps=12,
                        arrival_radius_m=10,
                        action=action,
                    ),
                )
        return str(mission.id)


async def run(seed: bool) -> None:
    await reset_storage()
    print(f"cleared PostgreSQL tables: {', '.join(RESET_TABLES)}")
    print("cleared Redis database 0")
    if seed:
        forest_id = await seed_mission(
            name="Angeles Forest Survey",
            description="Deterministic benign wildfire and environmental survey scenario.",
            scenario_type=MissionScenario.ANGELES_FOREST_SURVEY,
            callsigns=("UAV-01", "UAV-02", "UAV-03", "UAV-04"),
            origin_latitude=34.145,
            origin_longitude=-118.250,
        )
        ridge_id = await seed_mission(
            name="North Ridge Infrastructure Pass",
            description="Repeatable inspection route for a simulated infrastructure corridor.",
            scenario_type=MissionScenario.INFRASTRUCTURE_INSPECTION,
            callsigns=("RIDGE-UAV-01", "RIDGE-UAV-02"),
            origin_latitude=34.19,
            origin_longitude=-118.18,
        )
        print(f"seeded mission definitions: {forest_id}, {ridge_id}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm", action="store_true", help="confirm deletion of all local operational data")
    parser.add_argument("--empty", action="store_true", help="leave the catalog empty after the reset")
    args = parser.parse_args()
    if not args.confirm:
        parser.error("refusing to reset local data without --confirm")
    try:
        asyncio.run(run(seed=not args.empty))
    finally:
        asyncio.run(dispose_engine())


if __name__ == "__main__":
    main()
