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


def _telemetry(sequence: int, sim_time_ms: int) -> TelemetryEnvelope:
    return TelemetryEnvelope(
        mission_id=MISSION_ID,
        run_id=RUN_ID,
        vehicle_id=VEHICLE_ID,
        sequence=sequence,
        sim_time_ms=sim_time_ms,
        event_id=UUID(f"00000000-0000-0000-0000-{sequence + 200:012d}"),
        payload={"communications_state": "HEALTHY"},
    )


@pytest.mark.asyncio
async def test_persistence_downsampling_preserves_first_final_and_all_events(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[TelemetryEnvelope | SimulationEvent] = []

    async def fake_persist(items) -> persistence.PersistBatchResult:
        batch = list(items)
        seen.extend(batch)
        return persistence.PersistBatchResult(
            telemetry_inserted=sum(isinstance(item, TelemetryEnvelope) for item in batch),
            events_inserted=sum(isinstance(item, SimulationEvent) for item in batch),
            duration_ms=0.1,
        )

    monkeypatch.setattr(persistence, "persist_batch", fake_persist)
    worker = persistence.PersistenceWorker(
        batch_size=100,
        batch_window_seconds=0.01,
        maxsize=2,
        persist_rate_hz=2,
    )
    await worker.start()
    for sequence in range(6):
        await worker.enqueue(_telemetry(sequence, (sequence + 1) * 100))
    events = [
        SimulationEvent(
            mission_id=MISSION_ID,
            run_id=RUN_ID,
            vehicle_id=VEHICLE_ID,
            event_type=EventType.VEHICLE_READY,
            severity=EventSeverity.INFO,
            sim_time_ms=sequence * 100,
            payload={},
            event_id=UUID(f"00000000-0000-0000-0000-{sequence + 300:012d}"),
        )
        for sequence in range(3)
    ]
    for event in events:
        await worker.enqueue(event)
    await worker.finalize_telemetry()
    await worker.stop()

    persisted_sequences = [item.sequence for item in seen if isinstance(item, TelemetryEnvelope)]
    assert persisted_sequences == [0, 4, 5]
    assert [item for item in seen if isinstance(item, SimulationEvent)] == events
    assert worker.queue.maxsize == 2
    assert worker.queue_high_water_mark <= 2


@pytest.mark.asyncio
async def test_persistence_worker_failure_unblocks_shutdown(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fail(_items) -> persistence.PersistBatchResult:
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(persistence, "persist_batch", fail)
    worker = persistence.PersistenceWorker(batch_size=1, batch_window_seconds=0.01, maxsize=1)
    await worker.start()
    await worker.enqueue(_telemetry(0, 100))

    with pytest.raises(RuntimeError, match="durable persistence failed"):
        await worker.stop()
    assert worker.queue.empty()
