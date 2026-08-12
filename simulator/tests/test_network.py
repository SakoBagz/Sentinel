from uuid import UUID, uuid4

from app.domain.enums import CommunicationsState, EventType, FailureType
from sentinel_sim.engine import SimulationEngine
from sentinel_sim.models import MissionConfiguration, VehicleConfiguration, WaypointConfiguration
from sentinel_sim.navigation import Position
from sentinel_sim.network import NetworkConfiguration


def _mission() -> tuple[MissionConfiguration, UUID]:
    mission_id = UUID("00000000-0000-0000-0000-000000000011")
    vehicle_id = UUID("00000000-0000-0000-0000-000000000012")
    vehicle = VehicleConfiguration(
        id=vehicle_id, callsign="UAV-NET", vehicle_type="SURVEY", max_speed_mps=25,
        cruise_speed_mps=10, battery_capacity=100, telemetry_rate_hz=10,
        starting_position=Position(34.15, -118.24, 100),
    )
    waypoint = WaypointConfiguration(
        id=UUID("00000000-0000-0000-0000-000000000013"), vehicle_id=vehicle_id, sequence=0,
        latitude=34.16, longitude=-118.24, altitude_m=100,
    )
    return MissionConfiguration(id=mission_id, vehicles=(vehicle,), waypoints=(waypoint,), duration_limit_ms=20_000), vehicle_id


def test_blackout_disconnects_without_freezing_and_recovers() -> None:
    mission, vehicle_id = _mission()
    engine = SimulationEngine(mission, uuid4(), 99, network_profiles={vehicle_id: NetworkConfiguration()})
    engine.tick()
    before = engine.vehicles[vehicle_id].position
    failure_id = uuid4()
    engine.inject_failure(failure_id, vehicle_id, FailureType.COMMUNICATIONS_BLACKOUT, 1_000)
    for _ in range(5):
        engine.tick()
    during = engine.vehicles[vehicle_id].position
    assert engine.vehicles[vehicle_id].communications_state is CommunicationsState.DISCONNECTED
    assert during != before
    for _ in range(6):
        engine.tick()
    assert engine.vehicles[vehicle_id].communications_state is CommunicationsState.RECOVERING
    for _ in range(3):
        engine.tick()
    assert engine.vehicles[vehicle_id].communications_state is CommunicationsState.HEALTHY
    event_types = [event.event_type for event in engine.events]
    assert EventType.FAILURE_INJECTED in event_types
    assert EventType.FAILURE_CLEARED in event_types
    assert EventType.COMMUNICATIONS_LOST in event_types
    assert EventType.COMMUNICATIONS_RECOVERING in event_types


def test_packet_loss_is_seeded_and_creates_sequence_gaps() -> None:
    mission, vehicle_id = _mission()
    profile = NetworkConfiguration(packet_loss_percent=50)
    first = SimulationEngine(mission, uuid4(), 123, network_profiles={vehicle_id: profile}).run()
    second = SimulationEngine(mission, first.run_id, 123, network_profiles={vehicle_id: profile}).run()
    assert [sample.to_dict() for sample in first.telemetry] == [sample.to_dict() for sample in second.telemetry]
    assert len(first.generated_telemetry) > len(first.telemetry)


def test_latency_jitter_preserves_delivery_order_and_exposes_out_of_order_messages() -> None:
    mission, vehicle_id = _mission()
    profile = NetworkConfiguration(base_latency_ms=250, jitter_ms=250)
    result = SimulationEngine(mission, uuid4(), 0, network_profiles={vehicle_id: profile}).run()
    sequences = [sample.sequence for sample in result.telemetry if sample.vehicle_id == vehicle_id]
    assert len(sequences) > 10
    assert any(right < left for left, right in zip(sequences, sequences[1:]))


def test_shutdown_flushes_accepted_delayed_messages() -> None:
    mission, vehicle_id = _mission()
    profile = NetworkConfiguration(base_latency_ms=10_000)
    result = SimulationEngine(mission, uuid4(), 3, network_profiles={vehicle_id: profile}).run()
    assert len(result.telemetry) == len(result.generated_telemetry)
