from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, Double, Enum as SAEnum, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.db.models import Base
from app.domain.enums import (
    CommunicationsState,
    EventSeverity,
    EventType,
    FailureType,
    MissionStatus,
    RunStatus,
    VehicleMissionState,
    WaypointAction,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def enum_column(enum_type: type[Any], *, nullable: bool = False) -> Any:
    return mapped_column(SAEnum(enum_type, native_enum=False, validate_strings=True), nullable=nullable)


class Mission(Base):
    __tablename__ = "missions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    scenario_type: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[MissionStatus] = enum_column(MissionStatus)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    vehicle_memberships: Mapped[list["MissionVehicle"]] = relationship(
        back_populates="mission", cascade="all, delete-orphan", lazy="selectin"
    )
    waypoints: Mapped[list["Waypoint"]] = relationship(
        back_populates="mission", cascade="all, delete-orphan", lazy="selectin"
    )
    runs: Mapped[list["SimulationRun"]] = relationship(back_populates="mission", lazy="selectin")


class VehicleDefinition(Base):
    __tablename__ = "vehicle_definitions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    callsign: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    vehicle_type: Mapped[str] = mapped_column(String(100), nullable=False)
    max_speed_mps: Mapped[float] = mapped_column(Double, nullable=False)
    cruise_speed_mps: Mapped[float] = mapped_column(Double, nullable=False)
    battery_capacity: Mapped[float] = mapped_column(Double, nullable=False)
    telemetry_rate_hz: Mapped[float] = mapped_column(Double, nullable=False)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    mission_memberships: Mapped[list["MissionVehicle"]] = relationship(back_populates="vehicle_definition")
    run_vehicles: Mapped[list["RunVehicle"]] = relationship(back_populates="vehicle_definition")


class MissionVehicle(Base):
    __tablename__ = "mission_vehicles"
    __table_args__ = (UniqueConstraint("mission_id", "vehicle_definition_id", name="uq_mission_vehicle_definition"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    mission_id: Mapped[UUID] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"), nullable=False)
    vehicle_definition_id: Mapped[UUID] = mapped_column(ForeignKey("vehicle_definitions.id"), nullable=False)
    starting_latitude: Mapped[float | None] = mapped_column(Double)
    starting_longitude: Mapped[float | None] = mapped_column(Double)
    starting_altitude_m: Mapped[float | None] = mapped_column(Double)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    mission: Mapped[Mission] = relationship(back_populates="vehicle_memberships")
    vehicle_definition: Mapped[VehicleDefinition] = relationship(back_populates="mission_memberships")
    waypoints: Mapped[list["Waypoint"]] = relationship(back_populates="mission_vehicle")


class Waypoint(Base):
    __tablename__ = "waypoints"
    __table_args__ = (
        UniqueConstraint("mission_id", "vehicle_id", "sequence", name="uq_waypoint_sequence"),
        Index("ix_waypoints_mission_vehicle_sequence", "mission_id", "vehicle_id", "sequence"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    mission_id: Mapped[UUID] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"), nullable=False)
    vehicle_id: Mapped[UUID | None] = mapped_column(ForeignKey("mission_vehicles.id", ondelete="CASCADE"))
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    latitude: Mapped[float] = mapped_column(Double, nullable=False)
    longitude: Mapped[float] = mapped_column(Double, nullable=False)
    altitude_m: Mapped[float] = mapped_column(Double, nullable=False)
    target_speed_mps: Mapped[float | None] = mapped_column(Double)
    arrival_radius_m: Mapped[float | None] = mapped_column(Double)
    action: Mapped[WaypointAction] = enum_column(WaypointAction)

    mission: Mapped[Mission] = relationship(back_populates="waypoints")
    mission_vehicle: Mapped[MissionVehicle | None] = relationship(back_populates="waypoints")


class NetworkProfile(Base):
    __tablename__ = "network_profiles"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    base_latency_ms: Mapped[float] = mapped_column(Double, nullable=False)
    jitter_ms: Mapped[float] = mapped_column(Double, nullable=False)
    packet_loss_percent: Mapped[float] = mapped_column(Double, nullable=False)
    duplicate_percent: Mapped[float] = mapped_column(Double, nullable=False)
    disconnect_probability: Mapped[float] = mapped_column(Double, nullable=False)
    disconnect_duration_min_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    disconnect_duration_max_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    run_vehicles: Mapped[list["RunVehicle"]] = relationship(back_populates="network_profile")


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    mission_id: Mapped[UUID] = mapped_column(ForeignKey("missions.id"), nullable=False)
    status: Mapped[RunStatus] = enum_column(RunStatus)
    random_seed: Mapped[int] = mapped_column(nullable=False)
    simulation_speed: Mapped[float] = mapped_column(Double, nullable=False, default=1.0)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    mission: Mapped[Mission] = relationship(back_populates="runs")
    run_vehicles: Mapped[list["RunVehicle"]] = relationship(
        back_populates="run", cascade="all, delete-orphan", lazy="selectin"
    )


class RunVehicle(Base):
    __tablename__ = "run_vehicles"
    __table_args__ = (UniqueConstraint("run_id", "vehicle_definition_id", name="uq_run_vehicle_definition"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    run_id: Mapped[UUID] = mapped_column(ForeignKey("simulation_runs.id", ondelete="CASCADE"), nullable=False)
    vehicle_definition_id: Mapped[UUID] = mapped_column(ForeignKey("vehicle_definitions.id"), nullable=False)
    starting_latitude: Mapped[float | None] = mapped_column(Double)
    starting_longitude: Mapped[float | None] = mapped_column(Double)
    starting_altitude_m: Mapped[float | None] = mapped_column(Double)
    network_profile_id: Mapped[UUID | None] = mapped_column(ForeignKey("network_profiles.id"))
    configuration: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    run: Mapped[SimulationRun] = relationship(back_populates="run_vehicles")
    vehicle_definition: Mapped[VehicleDefinition] = relationship(back_populates="run_vehicles")
    network_profile: Mapped[NetworkProfile | None] = relationship(back_populates="run_vehicles")


class TelemetrySample(Base):
    __tablename__ = "telemetry_samples"
    __table_args__ = (
        UniqueConstraint("run_id", "vehicle_id", "sequence", name="uq_telemetry_sequence"),
        Index("ix_telemetry_run_time", "run_id", "sim_time_ms"),
        Index("ix_telemetry_run_vehicle_time", "run_id", "vehicle_id", "sim_time_ms"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    event_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    run_id: Mapped[UUID] = mapped_column(ForeignKey("simulation_runs.id", ondelete="CASCADE"), nullable=False)
    vehicle_id: Mapped[UUID] = mapped_column(ForeignKey("run_vehicles.id", ondelete="CASCADE"), nullable=False)
    sequence: Mapped[int] = mapped_column(nullable=False)
    sim_time_ms: Mapped[int] = mapped_column(nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    latitude: Mapped[float | None] = mapped_column(Double)
    longitude: Mapped[float | None] = mapped_column(Double)
    altitude_m: Mapped[float | None] = mapped_column(Double)
    heading_deg: Mapped[float | None] = mapped_column(Double)
    ground_speed_mps: Mapped[float | None] = mapped_column(Double)
    battery_percent: Mapped[float | None] = mapped_column(Double)
    mission_state: Mapped[VehicleMissionState | None] = enum_column(VehicleMissionState, nullable=True)
    communications_state: Mapped[CommunicationsState | None] = enum_column(CommunicationsState, nullable=True)


class MissionEvent(Base):
    __tablename__ = "mission_events"
    __table_args__ = (
        Index("ix_events_run_time", "run_id", "sim_time_ms"),
        Index("ix_events_run_vehicle_time", "run_id", "vehicle_id", "sim_time_ms"),
        Index("ix_events_run_type", "run_id", "event_type"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    run_id: Mapped[UUID] = mapped_column(ForeignKey("simulation_runs.id", ondelete="CASCADE"), nullable=False)
    vehicle_id: Mapped[UUID | None] = mapped_column(ForeignKey("run_vehicles.id", ondelete="CASCADE"))
    event_type: Mapped[EventType] = enum_column(EventType)
    severity: Mapped[EventSeverity] = enum_column(EventSeverity)
    schema_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    sim_time_ms: Mapped[int] = mapped_column(nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class FailureInjection(Base):
    __tablename__ = "failure_injections"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    run_id: Mapped[UUID] = mapped_column(ForeignKey("simulation_runs.id", ondelete="CASCADE"), nullable=False)
    vehicle_id: Mapped[UUID | None] = mapped_column(ForeignKey("run_vehicles.id", ondelete="CASCADE"))
    failure_type: Mapped[FailureType] = enum_column(FailureType)
    started_sim_time_ms: Mapped[int | None] = mapped_column(nullable=True)
    ended_sim_time_ms: Mapped[int | None] = mapped_column(nullable=True)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Debrief(Base):
    __tablename__ = "debriefs"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    run_id: Mapped[UUID] = mapped_column(ForeignKey("simulation_runs.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    structured_result: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
