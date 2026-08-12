from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid5

from app.domain.enums import CommunicationsState, EventSeverity, EventType, VehicleMissionState, WaypointAction

from sentinel_sim.navigation import Position

SCHEMA_VERSION = 1
SIMULATION_EPOCH = datetime(2026, 1, 1, tzinfo=timezone.utc)


@dataclass(frozen=True)
class WaypointConfiguration:
    id: UUID
    vehicle_id: UUID | None
    sequence: int
    latitude: float
    longitude: float
    altitude_m: float
    target_speed_mps: float | None = None
    arrival_radius_m: float = 10.0
    action: WaypointAction = WaypointAction.TRANSIT


@dataclass(frozen=True)
class VehicleConfiguration:
    id: UUID
    callsign: str
    vehicle_type: str
    max_speed_mps: float
    cruise_speed_mps: float
    battery_capacity: float
    telemetry_rate_hz: float
    starting_position: Position
    return_battery_threshold: float = 25.0
    configuration: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class MissionConfiguration:
    id: UUID
    vehicles: tuple[VehicleConfiguration, ...]
    waypoints: tuple[WaypointConfiguration, ...]
    duration_limit_ms: int = 15 * 60 * 1000


@dataclass(frozen=True)
class TelemetryEnvelope:
    mission_id: UUID
    run_id: UUID
    vehicle_id: UUID
    sequence: int
    sim_time_ms: int
    event_id: UUID
    payload: dict[str, Any]
    schema_version: int = SCHEMA_VERSION
    type: EventType = EventType.VEHICLE_TELEMETRY

    @property
    def emitted_at(self) -> datetime:
        return SIMULATION_EPOCH + timedelta(milliseconds=self.sim_time_ms)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "event_id": str(self.event_id),
            "mission_id": str(self.mission_id),
            "run_id": str(self.run_id),
            "vehicle_id": str(self.vehicle_id),
            "sequence": self.sequence,
            "sim_time_ms": self.sim_time_ms,
            "emitted_at": self.emitted_at.isoformat().replace("+00:00", "Z"),
            "type": self.type.value,
            "payload": self.payload,
        }


@dataclass(frozen=True)
class SimulationEvent:
    mission_id: UUID
    run_id: UUID
    event_type: EventType
    severity: EventSeverity
    sim_time_ms: int
    payload: dict[str, Any]
    event_id: UUID
    vehicle_id: UUID | None = None
    schema_version: int = SCHEMA_VERSION

    @property
    def timestamp(self) -> datetime:
        return SIMULATION_EPOCH + timedelta(milliseconds=self.sim_time_ms)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "event_id": str(self.event_id),
            "mission_id": str(self.mission_id),
            "run_id": str(self.run_id),
            "vehicle_id": str(self.vehicle_id) if self.vehicle_id else None,
            "sequence": None,
            "sim_time_ms": self.sim_time_ms,
            "emitted_at": self.timestamp.isoformat().replace("+00:00", "Z"),
            "type": self.event_type.value,
            "severity": self.severity.value,
            "payload": self.payload,
        }


@dataclass(frozen=True)
class VehicleSnapshot:
    vehicle_id: UUID
    callsign: str
    position: Position
    heading_deg: float
    ground_speed_mps: float
    battery_percent: float
    mission_state: VehicleMissionState
    communications_state: CommunicationsState
    current_waypoint_index: int
    sequence: int


@dataclass(frozen=True)
class SimulationResult:
    mission_id: UUID
    run_id: UUID
    random_seed: int
    duration_ms: int
    completed: bool
    telemetry: tuple[TelemetryEnvelope, ...]
    events: tuple[SimulationEvent, ...]
    vehicles: tuple[VehicleSnapshot, ...]


def deterministic_id(run_id: UUID, name: str, ordinal: int) -> UUID:
    return uuid5(run_id, f"sentinel:{name}:{ordinal}")

