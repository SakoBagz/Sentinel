from dataclasses import dataclass
from uuid import UUID

from app.domain.enums import CommunicationsState, EventSeverity, EventType, FailureType, VehicleMissionState

from sentinel_sim.battery import BatteryModel
from sentinel_sim.clock import SimulationClock
from sentinel_sim.models import (
    MissionConfiguration,
    SimulationEvent,
    SimulationResult,
    TelemetryEnvelope,
    VehicleConfiguration,
    VehicleSnapshot,
    deterministic_id,
)
from sentinel_sim.navigation import Position, bearing_between, destination_point, distance_between
from sentinel_sim.network import FailureWindow, NetworkConfiguration, NetworkSimulator
from sentinel_sim.random import SeededRandom


@dataclass
class _RuntimeVehicle:
    config: VehicleConfiguration
    position: Position
    heading_deg: float = 0.0
    ground_speed_mps: float = 0.0
    battery_percent: float = 100.0
    mission_state: VehicleMissionState = VehicleMissionState.IDLE
    communications_state: CommunicationsState = CommunicationsState.HEALTHY
    current_waypoint_index: int = 0
    sequence: int = 0
    low_battery_emitted: bool = False
    critical_battery_emitted: bool = False


class SimulationEngine:
    """Deterministic kinematic simulation for benign UAV operations."""

    def __init__(
        self,
        mission: MissionConfiguration,
        run_id: UUID,
        random_seed: int,
        *,
        tick_hz: float = 10.0,
        telemetry_rate_hz: float | None = None,
        battery_model: BatteryModel | None = None,
        network_profiles: dict[UUID, NetworkConfiguration] | None = None,
    ) -> None:
        if not mission.vehicles:
            raise ValueError("A simulation requires at least one vehicle")
        if mission.duration_limit_ms <= 0:
            raise ValueError("duration_limit_ms must be positive")
        self.mission = mission
        self.run_id = run_id
        self.random = SeededRandom(random_seed)
        self.random_seed = random_seed
        self.clock = SimulationClock(tick_hz=tick_hz)
        self.telemetry_rate_hz = telemetry_rate_hz or tick_hz
        self.telemetry_period_ms = max(1, round(1000 / self.telemetry_rate_hz))
        self.next_telemetry_ms = self.telemetry_period_ms
        self.battery_model = battery_model or BatteryModel()
        self.network = NetworkSimulator(self.random, network_profiles)
        self.vehicles = {
            config.id: _RuntimeVehicle(config=config, position=config.starting_position)
            for config in mission.vehicles
        }
        self.routes: dict[UUID, tuple] = {
            vehicle_id: tuple(
                sorted(
                    (waypoint for waypoint in mission.waypoints if waypoint.vehicle_id == vehicle_id),
                    key=lambda waypoint: waypoint.sequence,
                )
            )
            for vehicle_id in self.vehicles
        }
        self.telemetry: list[TelemetryEnvelope] = []
        self.generated_telemetry: list[TelemetryEnvelope] = []
        self.events: list[SimulationEvent] = []
        self._event_ordinal = 0

    def inject_failure(
        self,
        failure_id: UUID,
        vehicle_id: UUID,
        failure_type: FailureType,
        duration_ms: int,
        configuration: dict | None = None,
    ) -> None:
        if vehicle_id not in self.vehicles:
            raise ValueError("vehicle is not part of this run")
        if duration_ms <= 0:
            raise ValueError("failure duration must be positive")
        window = FailureWindow(
            failure_id=failure_id,
            failure_type=failure_type,
            start_sim_time_ms=self.clock.sim_time_ms,
            end_sim_time_ms=self.clock.sim_time_ms + duration_ms,
            configuration=configuration or {},
        )
        self.network.inject_failure(vehicle_id, window)
        vehicle = self.vehicles[vehicle_id]
        self._emit_event(vehicle, EventType.FAILURE_INJECTED, EventSeverity.WARNING, {
            "failure_id": str(failure_id), "failure_type": failure_type.value, "duration_ms": duration_ms,
        })

    def clear_failure(self, failure_id: UUID, vehicle_id: UUID) -> None:
        if vehicle_id not in self.vehicles:
            raise ValueError("vehicle is not part of this run")
        cleared = self.network.clear_failure(vehicle_id, failure_id, self.clock.sim_time_ms)
        if cleared is not None:
            self._emit_event(self.vehicles[vehicle_id], EventType.FAILURE_CLEARED, EventSeverity.INFO, {
                "failure_id": str(failure_id), "failure_type": cleared.failure_type.value,
            })

    def _emit_event(
        self,
        vehicle: _RuntimeVehicle,
        event_type: EventType,
        severity: EventSeverity,
        payload: dict,
    ) -> None:
        self._event_ordinal += 1
        self.events.append(
            SimulationEvent(
                mission_id=self.mission.id,
                run_id=self.run_id,
                vehicle_id=vehicle.config.id,
                event_type=event_type,
                severity=severity,
                sim_time_ms=self.clock.sim_time_ms,
                payload={"callsign": vehicle.config.callsign, **payload},
                event_id=deterministic_id(self.run_id, event_type.value, self._event_ordinal),
            )
        )

    def _transition(self, vehicle: _RuntimeVehicle, state: VehicleMissionState, event_type: EventType) -> None:
        vehicle.mission_state = state
        self._emit_event(vehicle, event_type, EventSeverity.INFO, {"mission_state": state.value})

    def _move_toward(self, vehicle: _RuntimeVehicle, target: Position, speed_mps: float) -> float:
        distance = distance_between(
            vehicle.position.latitude,
            vehicle.position.longitude,
            target.latitude,
            target.longitude,
        )
        if distance <= 0:
            vehicle.position = target
            vehicle.ground_speed_mps = 0.0
            return 0.0
        vehicle.heading_deg = bearing_between(
            vehicle.position.latitude,
            vehicle.position.longitude,
            target.latitude,
            target.longitude,
        )
        travel = min(distance, speed_mps * self.clock.dt_seconds)
        latitude, longitude = destination_point(
            vehicle.position.latitude, vehicle.position.longitude, vehicle.heading_deg, travel
        )
        altitude_delta = target.altitude_m - vehicle.position.altitude_m
        altitude_step = max(-5.0, min(5.0, altitude_delta))
        vehicle.position = Position(latitude, longitude, vehicle.position.altitude_m + altitude_step)
        vehicle.ground_speed_mps = travel / self.clock.dt_seconds
        return distance - travel

    def _update_battery(self, vehicle: _RuntimeVehicle) -> None:
        multiplier = 1.0
        for failure in self.network.active_failures(vehicle.config.id, self.clock.sim_time_ms):
            if failure.failure_type is FailureType.BATTERY_ANOMALY:
                multiplier = max(multiplier, float(failure.configuration.get("drain_multiplier", 2.0)))
        vehicle.battery_percent = max(
            0.0,
            vehicle.battery_percent
            - self.battery_model.drain_percent(vehicle.ground_speed_mps, self.clock.dt_seconds) * multiplier,
        )
        if vehicle.battery_percent <= 30 and not vehicle.low_battery_emitted:
            vehicle.low_battery_emitted = True
            self._emit_event(vehicle, EventType.BATTERY_LOW, EventSeverity.WARNING, {"battery_percent": vehicle.battery_percent})
        if vehicle.battery_percent <= 5 and not vehicle.critical_battery_emitted:
            vehicle.critical_battery_emitted = True
            self._emit_event(vehicle, EventType.BATTERY_CRITICAL, EventSeverity.CRITICAL, {"battery_percent": vehicle.battery_percent})
        if vehicle.battery_percent <= vehicle.config.return_battery_threshold and vehicle.mission_state in {
            VehicleMissionState.TRANSIT,
            VehicleMissionState.EXECUTING,
        }:
            self._transition(vehicle, VehicleMissionState.RETURNING, EventType.VEHICLE_RETURNING)

    def _update_vehicle(self, vehicle: _RuntimeVehicle) -> None:
        if vehicle.mission_state is VehicleMissionState.IDLE:
            self._transition(vehicle, VehicleMissionState.READY, EventType.VEHICLE_READY)
        elif vehicle.mission_state is VehicleMissionState.READY:
            self._transition(vehicle, VehicleMissionState.LAUNCHING, EventType.VEHICLE_LAUNCHED)
        elif vehicle.mission_state is VehicleMissionState.LAUNCHING:
            self._transition(vehicle, VehicleMissionState.TRANSIT, EventType.VEHICLE_LAUNCHED)
        elif vehicle.mission_state in {VehicleMissionState.TRANSIT, VehicleMissionState.EXECUTING}:
            route = self.routes[vehicle.config.id]
            if vehicle.current_waypoint_index >= len(route):
                self._transition(vehicle, VehicleMissionState.RETURNING, EventType.VEHICLE_RETURNING)
            else:
                waypoint = route[vehicle.current_waypoint_index]
                target = Position(waypoint.latitude, waypoint.longitude, waypoint.altitude_m)
                remaining = self._move_toward(
                    vehicle,
                    target,
                    waypoint.target_speed_mps or vehicle.config.cruise_speed_mps,
                )
                if remaining <= waypoint.arrival_radius_m:
                    vehicle.position = target
                    self._emit_event(
                        vehicle,
                        EventType.VEHICLE_WAYPOINT_REACHED,
                        EventSeverity.INFO,
                        {"waypoint_id": str(waypoint.id), "sequence": waypoint.sequence},
                    )
                    vehicle.current_waypoint_index += 1
                    if vehicle.current_waypoint_index >= len(route):
                        self._transition(vehicle, VehicleMissionState.RETURNING, EventType.VEHICLE_RETURNING)
                    elif vehicle.mission_state is VehicleMissionState.TRANSIT:
                        vehicle.mission_state = VehicleMissionState.EXECUTING if waypoint.action.value == "SURVEY" else VehicleMissionState.TRANSIT
        elif vehicle.mission_state is VehicleMissionState.RETURNING:
            remaining = self._move_toward(vehicle, vehicle.config.starting_position, vehicle.config.cruise_speed_mps)
            if remaining <= 2.0:
                vehicle.position = vehicle.config.starting_position
                vehicle.ground_speed_mps = 0.0
                self._transition(vehicle, VehicleMissionState.LANDED, EventType.VEHICLE_LANDED)
                self._transition(vehicle, VehicleMissionState.COMPLETE, EventType.VEHICLE_COMPLETED)
        self._update_battery(vehicle)

    def _sync_network_state(self, vehicle: _RuntimeVehicle) -> None:
        previous = vehicle.communications_state.value
        current = self.network.advance(vehicle.config.id, self.clock.sim_time_ms, self.clock.tick_interval_ms)
        vehicle.communications_state = CommunicationsState(current)
        if previous == current:
            return
        mapping = {
            "DEGRADED": (EventType.COMMUNICATIONS_DEGRADED, EventSeverity.WARNING),
            "STALE": (EventType.COMMUNICATIONS_STALE, EventSeverity.WARNING),
            "DISCONNECTED": (EventType.COMMUNICATIONS_LOST, EventSeverity.CRITICAL),
            "RECOVERING": (EventType.COMMUNICATIONS_RECOVERING, EventSeverity.INFO),
            "HEALTHY": (EventType.COMMUNICATIONS_RESTORED, EventSeverity.INFO),
        }
        event_type, severity = mapping[current]
        self._emit_event(vehicle, event_type, severity, {"communications_state": current})

    def _emit_telemetry(self, vehicle: _RuntimeVehicle) -> None:
        event_id = deterministic_id(self.run_id, f"telemetry:{vehicle.config.id}", vehicle.sequence)
        envelope = TelemetryEnvelope(
                mission_id=self.mission.id,
                run_id=self.run_id,
                vehicle_id=vehicle.config.id,
                sequence=vehicle.sequence,
                sim_time_ms=self.clock.sim_time_ms,
                event_id=event_id,
                payload={
                    "latitude": vehicle.position.latitude,
                    "longitude": vehicle.position.longitude,
                    "altitude_m": vehicle.position.altitude_m,
                    "heading_deg": vehicle.heading_deg,
                    "ground_speed_mps": vehicle.ground_speed_mps,
                    "battery_percent": vehicle.battery_percent,
                    "mission_state": vehicle.mission_state.value,
                    "communications_state": vehicle.communications_state.value,
                },
            )
        self.generated_telemetry.append(envelope)
        self.network.submit(envelope)
        vehicle.sequence += 1

    def tick(self) -> None:
        self.clock.advance()
        for vehicle in self.vehicles.values():
            for expired in self.network.expired_failures(vehicle.config.id, self.clock.sim_time_ms):
                self._emit_event(vehicle, EventType.FAILURE_CLEARED, EventSeverity.INFO, {
                    "failure_id": str(expired.failure_id), "failure_type": expired.failure_type.value,
                })
            self._sync_network_state(vehicle)
            self._update_vehicle(vehicle)
            if self.clock.sim_time_ms >= self.next_telemetry_ms:
                self._emit_telemetry(vehicle)
        if self.clock.sim_time_ms >= self.next_telemetry_ms:
            self.next_telemetry_ms += self.telemetry_period_ms
        self.telemetry.extend(self.network.drain(self.clock.sim_time_ms))

    def is_complete(self) -> bool:
        return all(vehicle.mission_state is VehicleMissionState.COMPLETE for vehicle in self.vehicles.values())

    def run(self) -> SimulationResult:
        while not self.is_complete() and self.clock.sim_time_ms < self.mission.duration_limit_ms:
            self.tick()
        snapshots = tuple(
            VehicleSnapshot(
                vehicle_id=vehicle.config.id,
                callsign=vehicle.config.callsign,
                position=vehicle.position,
                heading_deg=vehicle.heading_deg,
                ground_speed_mps=vehicle.ground_speed_mps,
                battery_percent=vehicle.battery_percent,
                mission_state=vehicle.mission_state,
                communications_state=vehicle.communications_state,
                current_waypoint_index=vehicle.current_waypoint_index,
                sequence=vehicle.sequence,
            )
            for vehicle in self.vehicles.values()
        )
        return SimulationResult(
            mission_id=self.mission.id,
            run_id=self.run_id,
            random_seed=self.random_seed,
            duration_ms=self.clock.sim_time_ms,
            completed=self.is_complete(),
            telemetry=tuple(self.telemetry),
            generated_telemetry=tuple(self.generated_telemetry),
            events=tuple(self.events),
            vehicles=snapshots,
        )
