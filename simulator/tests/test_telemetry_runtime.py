from dataclasses import replace
from uuid import UUID, uuid4

import pytest

from sentinel_sim.engine import SimulationEngine
from sentinel_sim.models import MissionConfiguration, VehicleConfiguration, WaypointConfiguration
from sentinel_sim.network import NetworkConfiguration, NetworkSimulator
from sentinel_sim.models import TelemetryEnvelope
from sentinel_sim.navigation import Position
from sentinel_sim.random import SeededRandom


def make_mission() -> tuple[MissionConfiguration, UUID, UUID]:
    mission_id = UUID("00000000-0000-0000-0000-000000000411")
    vehicle_id = UUID("00000000-0000-0000-0000-000000000412")
    vehicle = VehicleConfiguration(
        id=vehicle_id,
        callsign="UAV-RATE-001",
        vehicle_type="SURVEY",
        max_speed_mps=25,
        cruise_speed_mps=20,
        battery_capacity=100,
        telemetry_rate_hz=10,
        starting_position=Position(34.15, -118.24, 100),
    )
    waypoint = WaypointConfiguration(
        id=UUID("00000000-0000-0000-0000-000000000413"),
        vehicle_id=vehicle_id,
        sequence=0,
        latitude=34.151,
        longitude=-118.24,
        altitude_m=120,
    )
    return MissionConfiguration(id=mission_id, vehicles=(vehicle,), waypoints=(waypoint,), duration_limit_ms=20_000), mission_id, vehicle_id


def test_each_vehicle_uses_its_configured_telemetry_rate() -> None:
    mission, _, first_id = make_mission()
    second_id = uuid4()
    second = replace(mission.vehicles[0], id=second_id, callsign="UAV-002", telemetry_rate_hz=5)
    mission = replace(mission, vehicles=(mission.vehicles[0], second), duration_limit_ms=1_000)
    engine = SimulationEngine(mission, uuid4(), 42, tick_hz=10, retain_history=False)

    generated = []
    for _ in range(10):
        engine.tick()
        generated.extend(engine.drain_outputs().generated_telemetry)

    by_vehicle = {
        first_id: [sample for sample in generated if sample.vehicle_id == first_id],
        second_id: [sample for sample in generated if sample.vehicle_id == second_id],
    }
    assert len(by_vehicle[first_id]) == 10
    assert len(by_vehicle[second_id]) == 5
    assert [sample.sim_time_ms for sample in by_vehicle[second_id]] == [200, 400, 600, 800, 1_000]


def test_mixed_rate_trace_remains_deterministic() -> None:
    mission, _, _ = make_mission()
    second = replace(mission.vehicles[0], id=uuid4(), callsign="UAV-002", telemetry_rate_hz=2.5)
    mission = replace(mission, vehicles=(mission.vehicles[0], second), duration_limit_ms=2_000)
    run_id = UUID("00000000-0000-0000-0000-000000000414")

    def trace() -> tuple[list[dict], list[dict]]:
        engine = SimulationEngine(mission, run_id, 9, tick_hz=10, retain_history=False)
        telemetry = []
        events = []
        for _ in range(20):
            engine.tick()
            outputs = engine.drain_outputs()
            telemetry.extend(sample.to_dict() for sample in outputs.generated_telemetry)
            events.extend(event.to_dict() for event in outputs.events)
        return telemetry, events

    assert trace() == trace()


def test_telemetry_rate_above_tick_rate_is_rejected() -> None:
    mission, _, _ = make_mission()
    invalid = replace(mission.vehicles[0], telemetry_rate_hz=11)
    with pytest.raises(ValueError, match="cannot exceed simulation tick rate"):
        SimulationEngine(replace(mission, vehicles=(invalid,)), uuid4(), 1, tick_hz=10)


def test_live_engine_outputs_are_drained_without_retaining_history() -> None:
    mission, _, _ = make_mission()
    engine = SimulationEngine(mission, uuid4(), 1, retain_history=False)
    engine.tick()
    first = engine.drain_outputs()
    second = engine.drain_outputs()

    assert first.generated_telemetry
    assert first.events
    assert not second.generated_telemetry
    assert not second.telemetry
    assert not second.events
    assert engine.generated_telemetry == []
    assert engine.telemetry == []
    assert engine.events == []


def test_network_statistics_distinguish_originals_duplicates_and_missing() -> None:
    vehicle_id = UUID("00000000-0000-0000-0000-000000000401")
    mission_id = UUID("00000000-0000-0000-0000-000000000402")
    run_id = UUID("00000000-0000-0000-0000-000000000403")
    envelope = TelemetryEnvelope(
        mission_id=mission_id,
        run_id=run_id,
        vehicle_id=vehicle_id,
        sequence=0,
        sim_time_ms=100,
        event_id=uuid4(),
        payload={"communications_state": "HEALTHY"},
    )
    duplicate_network = NetworkSimulator(
        SeededRandom(7), {vehicle_id: NetworkConfiguration(duplicate_percent=100)}
    )
    duplicate_network.submit(envelope)
    assert len(duplicate_network.drain(100)) == 2
    stats = duplicate_network.statistics()
    assert stats.generated_messages == 1
    assert stats.delivered_messages == 2
    assert stats.unique_delivered_messages == 1
    assert stats.duplicate_messages == 1
    assert stats.missing_messages == 0
    assert stats.healthy_delivered_messages == 2

    loss_network = NetworkSimulator(
        SeededRandom(7), {vehicle_id: NetworkConfiguration(packet_loss_percent=100)}
    )
    loss_network.submit(envelope)
    assert loss_network.drain(100) == []
    assert loss_network.statistics().missing_messages == 1


def test_network_latency_is_modelled_in_simulation_time() -> None:
    vehicle_id = UUID("00000000-0000-0000-0000-000000000404")
    envelope = TelemetryEnvelope(
        mission_id=UUID("00000000-0000-0000-0000-000000000405"),
        run_id=UUID("00000000-0000-0000-0000-000000000406"),
        vehicle_id=vehicle_id,
        sequence=0,
        sim_time_ms=100,
        event_id=uuid4(),
        payload={"communications_state": "HEALTHY"},
    )
    network = NetworkSimulator(
        SeededRandom(7), {vehicle_id: NetworkConfiguration(base_latency_ms=25)}
    )
    network.submit(envelope)
    network.drain(125)
    assert network.statistics().modeled_latency_p50_ms == 25
