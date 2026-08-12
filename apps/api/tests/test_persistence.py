from datetime import timezone
from uuid import UUID

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.models import Base
from app.db.models.entities import MissionEvent, TelemetrySample
from app.domain.enums import EventSeverity, EventType
from app.realtime import persistence
from sentinel_sim.models import SimulationEvent, TelemetryEnvelope


RUN_ID = UUID("00000000-0000-0000-0000-000000000101")
VEHICLE_ID = UUID("00000000-0000-0000-0000-000000000102")
MISSION_ID = UUID("00000000-0000-0000-0000-000000000103")


@pytest.mark.asyncio
async def test_persist_batch_is_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    monkeypatch.setattr(persistence, "SessionFactory", factory)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    telemetry = TelemetryEnvelope(
        mission_id=MISSION_ID,
        run_id=RUN_ID,
        vehicle_id=VEHICLE_ID,
        sequence=0,
        sim_time_ms=100,
        event_id=UUID("00000000-0000-0000-0000-000000000104"),
        payload={"latitude": 34.15, "longitude": -118.24, "communications_state": "HEALTHY"},
    )
    event = SimulationEvent(
        mission_id=MISSION_ID,
        run_id=RUN_ID,
        vehicle_id=VEHICLE_ID,
        event_type=EventType.VEHICLE_READY,
        severity=EventSeverity.INFO,
        sim_time_ms=100,
        payload={"callsign": "UAV-01"},
        event_id=UUID("00000000-0000-0000-0000-000000000105"),
    )

    await persistence.persist_batch([telemetry, event, telemetry, event])
    async with factory() as session:
        telemetry_count = await session.scalar(
            select(func.count()).select_from(TelemetrySample).where(TelemetrySample.run_id == RUN_ID)
        )
        event_count = await session.scalar(
            select(func.count()).select_from(MissionEvent).where(MissionEvent.run_id == RUN_ID)
        )
        stored = await session.scalar(select(TelemetrySample).where(TelemetrySample.run_id == RUN_ID))

    assert telemetry_count == 1
    assert event_count == 1
    assert stored is not None
    assert stored.received_at.tzinfo is None or stored.received_at.tzinfo == timezone.utc
    await engine.dispose()
