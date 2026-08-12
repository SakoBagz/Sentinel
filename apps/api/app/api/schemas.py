import json
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.enums import FailureType, MissionStatus, RunStatus, WaypointAction


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


class MissionCreate(APIModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    scenario_type: str | None = Field(default=None, max_length=100)


class MissionUpdate(APIModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    scenario_type: str | None = Field(default=None, max_length=100)


class VehicleCreate(APIModel):
    callsign: str = Field(min_length=1, max_length=100)
    vehicle_type: str = Field(default="SURVEY", min_length=1, max_length=100)
    max_speed_mps: float = Field(default=25.0, gt=0)
    cruise_speed_mps: float = Field(default=18.0, gt=0)
    battery_capacity: float = Field(default=100.0, gt=0)
    telemetry_rate_hz: float = Field(default=10.0, gt=0)
    starting_latitude: float | None = Field(default=None, ge=-90, le=90)
    starting_longitude: float | None = Field(default=None, ge=-180, le=180)
    starting_altitude_m: float | None = Field(default=None, ge=0)
    configuration: dict[str, Any] = Field(default_factory=dict)

    @field_validator("cruise_speed_mps")
    @classmethod
    def cruise_not_above_max(cls, value: float, info: Any) -> float:
        max_speed = info.data.get("max_speed_mps")
        if max_speed is not None and value > max_speed:
            raise ValueError("cruise_speed_mps cannot exceed max_speed_mps")
        return value


class VehicleRead(APIModel):
    id: UUID
    vehicle_definition_id: UUID
    callsign: str
    vehicle_type: str
    max_speed_mps: float
    cruise_speed_mps: float
    battery_capacity: float
    telemetry_rate_hz: float
    starting_latitude: float | None
    starting_longitude: float | None
    starting_altitude_m: float | None
    configuration: dict[str, Any]


class WaypointCreate(APIModel):
    vehicle_id: UUID | None = None
    sequence: int = Field(ge=0)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    altitude_m: float = Field(ge=0)
    target_speed_mps: float | None = Field(default=None, gt=0)
    arrival_radius_m: float | None = Field(default=None, gt=0)
    action: WaypointAction = WaypointAction.TRANSIT


class WaypointUpdate(APIModel):
    vehicle_id: UUID | None = None
    sequence: int | None = Field(default=None, ge=0)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    altitude_m: float | None = Field(default=None, ge=0)
    target_speed_mps: float | None = Field(default=None, gt=0)
    arrival_radius_m: float | None = Field(default=None, gt=0)
    action: WaypointAction | None = None


class WaypointRead(APIModel):
    id: UUID
    mission_id: UUID
    vehicle_id: UUID | None
    sequence: int
    latitude: float
    longitude: float
    altitude_m: float
    target_speed_mps: float | None
    arrival_radius_m: float | None
    action: WaypointAction


class MissionRead(APIModel):
    id: UUID
    name: str
    description: str | None
    scenario_type: str | None
    status: MissionStatus
    created_at: datetime
    updated_at: datetime
    vehicles: list[VehicleRead] = Field(default_factory=list)
    waypoints: list[WaypointRead] = Field(default_factory=list)


class MissionList(APIModel):
    items: list[MissionRead]
    next_cursor: str | None = None


class RunCreate(APIModel):
    random_seed: int | None = None
    simulation_speed: float = Field(default=1.0, gt=0)
    duration_limit_minutes: int | None = Field(default=None, ge=1, le=24 * 60)


class RunVehicleRead(APIModel):
    id: UUID
    vehicle_definition_id: UUID
    callsign: str
    starting_latitude: float | None
    starting_longitude: float | None
    starting_altitude_m: float | None


class RunRead(APIModel):
    id: UUID
    mission_id: UUID
    status: RunStatus
    random_seed: int
    simulation_speed: float
    configuration: dict[str, Any]
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    vehicles: list[RunVehicleRead] = Field(default_factory=list)


class FailureCreate(APIModel):
    vehicle_id: UUID
    failure_type: FailureType
    duration_ms: int = Field(default=10_000, ge=100, le=15 * 60 * 1000)
    configuration: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_safe_configuration(self) -> "FailureCreate":
        limits = {
            "latency_ms": (0.0, 60_000.0),
            "jitter_ms": (0.0, 60_000.0),
            "delay_ms": (0.0, 60_000.0),
            "packet_loss_percent": (0.0, 100.0),
            "gps_quality_percent": (0.0, 100.0),
            "drain_multiplier": (0.1, 20.0),
        }
        for key, (lower, upper) in limits.items():
            if key not in self.configuration:
                continue
            value = self.configuration[key]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not lower <= float(value) <= upper:
                raise ValueError(f"configuration.{key} must be between {lower:g} and {upper:g}")
        sensor = self.configuration.get("sensor")
        if sensor is not None and (not isinstance(sensor, str) or not sensor.strip() or len(sensor) > 64):
            raise ValueError("configuration.sensor must be a non-empty string of at most 64 characters")
        return self


class FailureRead(APIModel):
    id: UUID
    run_id: UUID
    vehicle_id: UUID | None
    failure_type: FailureType
    started_sim_time_ms: int | None
    ended_sim_time_ms: int | None
    configuration: dict[str, Any]
    created_at: datetime


class TelemetryRead(APIModel):
    id: int
    event_id: UUID
    run_id: UUID
    vehicle_id: UUID
    sequence: int
    sim_time_ms: int
    received_at: datetime
    latitude: float | None
    longitude: float | None
    altitude_m: float | None
    heading_deg: float | None
    ground_speed_mps: float | None
    battery_percent: float | None
    mission_state: str | None
    communications_state: str | None


class EventRead(APIModel):
    id: UUID
    run_id: UUID
    vehicle_id: UUID | None
    event_type: str
    severity: str
    schema_version: int
    sim_time_ms: int
    timestamp: datetime
    payload: dict[str, Any]


class TelemetryPage(APIModel):
    items: list[TelemetryRead]
    next_cursor: str | None = None


class EventPage(APIModel):
    items: list[EventRead]
    next_cursor: str | None = None


class MetricsRead(APIModel):
    run_id: UUID
    telemetry_messages_received: int
    telemetry_sequences_missing: int
    telemetry_sequences_duplicate: int
    telemetry_sequences_out_of_order: int
    event_count: int
    warning_count: int
    critical_count: int
    vehicle_count: int
    completed_vehicle_count: int
    mission_duration_ms: int
    communications_availability_percent: float
    telemetry_throughput_per_second: float
    latency_p50_ms: float
    latency_p95_ms: float
    latency_p99_ms: float


class AnalystRequest(APIModel):
    message: str = Field(min_length=1, max_length=2_000)
    conversation_context: list[dict[str, Any]] = Field(default_factory=list, max_length=10)

    @field_validator("conversation_context")
    @classmethod
    def bounded_context(cls, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if sum(len(json.dumps(item, separators=(",", ":"))) for item in value) > 10_000:
            raise ValueError("conversation_context must be at most 10,000 JSON characters")
        return value


class EvidenceRead(APIModel):
    event_id: UUID
    vehicle_id: UUID | None = None
    sim_time_ms: int = Field(ge=0)


class AnalystResponse(APIModel):
    run_id: UUID
    answer: str
    confidence: Literal["high", "medium", "low"]
    evidence: list[EvidenceRead] = Field(default_factory=list, max_length=20)
    limitations: list[str] = Field(default_factory=list, max_length=20)
    provider: str
    model: str | None = None
    sections: dict[str, str] = Field(default_factory=dict)
