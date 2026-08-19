from datetime import datetime, timezone
from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.models import Base
from app.db.models.entities import (
    Mission,
    MissionEvent,
    MissionVehicle,
    RunTelemetrySummary,
    RunVehicle,
    SimulationRun,
    TelemetrySample,
    VehicleDefinition,
)
from app.domain.enums import EventSeverity, EventType, MissionStatus, RunStatus
from app.services.metrics_service import run_metrics


@pytest.mark.asyncio
async def test_metrics_use_summary_instead_of_downsampled_sequence_gaps() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    mission_id = UUID("00000000-0000-0000-0000-000000000501")
    definition_id = UUID("00000000-0000-0000-0000-000000000502")
    membership_id = UUID("00000000-0000-0000-0000-000000000503")
    run_id = UUID("00000000-0000-0000-0000-000000000504")
    run_vehicle_id = UUID("00000000-0000-0000-0000-000000000505")
    definition = VehicleDefinition(
        id=definition_id,
        callsign="UAV-SUMMARY",
        vehicle_type="SURVEY",
        max_speed_mps=25,
        cruise_speed_mps=10,
        battery_capacity=100,
        telemetry_rate_hz=10,
        configuration={},
    )
    mission = Mission(id=mission_id, name="Summary", status=MissionStatus.COMPLETED)
    membership = MissionVehicle(
        id=membership_id, mission=mission, vehicle_definition=definition, configuration={}
    )
    run = SimulationRun(
        id=run_id,
        mission=mission,
        status=RunStatus.COMPLETED,
        random_seed=1,
        simulation_speed=1,
        configuration={},
        created_at=datetime.now(timezone.utc),
    )
    run_vehicle = RunVehicle(
        id=run_vehicle_id, run=run, vehicle_definition=definition, configuration={}
    )
    samples = [
        TelemetrySample(
            event_id=UUID(f"00000000-0000-0000-0000-{sequence + 600:012d}"),
            run_id=run_id,
            vehicle_id=run_vehicle_id,
            sequence=sequence,
            sim_time_ms=sequence * 500,
            communications_state="HEALTHY",
        )
        for sequence in (0, 5, 10)
    ]
    event = MissionEvent(
        id=UUID("00000000-0000-0000-0000-000000000601"),
        run_id=run_id,
        vehicle_id=run_vehicle_id,
        event_type=EventType.VEHICLE_COMPLETED,
        severity=EventSeverity.INFO,
        sim_time_ms=5_000,
        timestamp=datetime.now(timezone.utc),
        payload={},
    )
    summary = RunTelemetrySummary(
        run_id=run_id,
        generated_messages=30,
        delivered_messages=30,
        unique_delivered_messages=30,
        persisted_messages=3,
        missing_messages=0,
        duplicate_messages=0,
        out_of_order_messages=0,
        healthy_delivered_messages=30,
        modeled_latency_p50_ms=10,
        modeled_latency_p95_ms=20,
        modeled_latency_p99_ms=25,
        persistence_queue_high_water_mark=2,
        simulated_mission_duration_ms=5_000,
    )
    async with factory() as session:
        session.add_all([definition, mission, membership, run, run_vehicle, *samples, event, summary])
        await session.commit()
        result = await run_metrics(session, run_id)

    assert result["telemetry_messages_delivered"] == 30
    assert result["telemetry_messages_persisted"] == 3
    assert result["telemetry_sequences_missing"] == 0
    assert result["telemetry_throughput_per_second"] == 6
    assert result["latency_p95_ms"] == 20
    assert result["completed_vehicle_count"] == 1
    await engine.dispose()
