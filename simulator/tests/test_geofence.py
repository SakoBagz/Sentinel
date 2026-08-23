from uuid import uuid4, uuid5

from app.domain.enums import EventType
from sentinel_sim.engine import SimulationEngine
from sentinel_sim.models import AreaOfInterest, MissionConfiguration, VehicleConfiguration, WaypointConfiguration
from sentinel_sim.navigation import Position


def test_geofence_exit_and_reenter_events() -> None:
    run_id = uuid4()
    vehicle_id = uuid5(run_id, "v")
    mission = MissionConfiguration(
        id=uuid5(run_id, "m"),
        vehicles=(
            VehicleConfiguration(
                id=vehicle_id,
                callsign="UAV-GF",
                vehicle_type="SURVEY",
                max_speed_mps=40,
                cruise_speed_mps=30,
                battery_capacity=100,
                telemetry_rate_hz=10,
                starting_position=Position(34.150, -118.240, 100),
            ),
        ),
        waypoints=(
            WaypointConfiguration(
                id=uuid5(run_id, "w"),
                vehicle_id=vehicle_id,
                sequence=0,
                latitude=34.152,
                longitude=-118.240,
                altitude_m=100,
                target_speed_mps=30,
                arrival_radius_m=5,
            ),
        ),
        duration_limit_ms=120_000,
        area_of_interest=AreaOfInterest(
            min_latitude=34.1495,
            max_latitude=34.1510,
            min_longitude=-118.241,
            max_longitude=-118.239,
        ),
    )
    engine = SimulationEngine(mission, run_id, random_seed=11, tick_hz=10.0)
    for _ in range(400):
        engine.tick()
        if any(event.event_type is EventType.GEOFENCE_EXIT for event in engine.events):
            break
    assert any(event.event_type is EventType.GEOFENCE_EXIT for event in engine.events)
