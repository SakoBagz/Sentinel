from uuid import UUID, uuid4

from app.domain.enums import EventType, VehicleMissionState, WaypointAction
from sentinel_sim.engine import SimulationEngine
from sentinel_sim.models import MissionConfiguration, VehicleConfiguration, WaypointConfiguration
from sentinel_sim.navigation import Position


def make_mission() -> tuple[MissionConfiguration, UUID, UUID]:
    mission_id = UUID("00000000-0000-0000-0000-000000000001")
    vehicle_id = UUID("00000000-0000-0000-0000-000000000002")
    waypoint_id = UUID("00000000-0000-0000-0000-000000000003")
    vehicle = VehicleConfiguration(
        id=vehicle_id,
        callsign="UAV-001",
        vehicle_type="SURVEY",
        max_speed_mps=25,
        cruise_speed_mps=20,
        battery_capacity=100,
        telemetry_rate_hz=10,
        starting_position=Position(34.15, -118.24, 100),
    )
    waypoint = WaypointConfiguration(
        id=waypoint_id,
        vehicle_id=vehicle_id,
        sequence=0,
        latitude=34.151,
        longitude=-118.24,
        altitude_m=120,
        action=WaypointAction.SURVEY,
    )
    return MissionConfiguration(id=mission_id, vehicles=(vehicle,), waypoints=(waypoint,), duration_limit_ms=20_000), mission_id, vehicle_id


def test_vehicle_moves_reaches_waypoint_and_completes() -> None:
    mission, mission_id, vehicle_id = make_mission()
    result = SimulationEngine(mission, uuid4(), 42).run()
    snapshot = result.vehicles[0]
    assert result.completed
    assert snapshot.vehicle_id == vehicle_id
    assert snapshot.mission_state is VehicleMissionState.COMPLETE
    assert snapshot.current_waypoint_index == 1
    assert snapshot.battery_percent < 100
    assert any(event.event_type is EventType.VEHICLE_WAYPOINT_REACHED for event in result.events)
    assert all(sample.mission_id == mission_id for sample in result.telemetry)


def test_fixed_seed_reproduces_telemetry_and_events() -> None:
    mission, _, _ = make_mission()
    run_id = UUID("00000000-0000-0000-0000-000000000004")
    first = SimulationEngine(mission, run_id, 7).run()
    second = SimulationEngine(mission, run_id, 7).run()
    assert [sample.to_dict() for sample in first.telemetry] == [sample.to_dict() for sample in second.telemetry]
    assert [event.to_dict() for event in first.events] == [event.to_dict() for event in second.events]


def test_telemetry_sequences_are_monotonic_per_vehicle() -> None:
    mission, _, vehicle_id = make_mission()
    result = SimulationEngine(mission, uuid4(), 11).run()
    sequences = [sample.sequence for sample in result.telemetry if sample.vehicle_id == vehicle_id]
    assert sequences == list(range(len(sequences)))

