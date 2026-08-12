import asyncio
import logging
from time import perf_counter
from collections.abc import Iterable
from datetime import datetime, timezone

from sqlalchemy import insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.db.models.entities import MissionEvent, TelemetrySample
from app.db.session import SessionFactory
from app.observability.metrics import metrics
from sentinel_sim.models import SimulationEvent, TelemetryEnvelope

logger = logging.getLogger(__name__)


def _telemetry_values(sample: TelemetryEnvelope) -> dict:
    return {
        "event_id": sample.event_id,
        "run_id": sample.run_id,
        "vehicle_id": sample.vehicle_id,
        "sequence": sample.sequence,
        "sim_time_ms": sample.sim_time_ms,
        "received_at": datetime.now(timezone.utc),
        "latitude": sample.payload.get("latitude"),
        "longitude": sample.payload.get("longitude"),
        "altitude_m": sample.payload.get("altitude_m"),
        "heading_deg": sample.payload.get("heading_deg"),
        "ground_speed_mps": sample.payload.get("ground_speed_mps"),
        "battery_percent": sample.payload.get("battery_percent"),
        "mission_state": sample.payload.get("mission_state"),
        "communications_state": sample.payload.get("communications_state"),
    }


def _event_values(event: SimulationEvent) -> dict:
    return {
        "id": event.event_id,
        "run_id": event.run_id,
        "vehicle_id": event.vehicle_id,
        "event_type": event.event_type,
        "severity": event.severity,
        "schema_version": event.schema_version,
        "sim_time_ms": event.sim_time_ms,
        "timestamp": event.timestamp,
        "payload": event.payload,
    }


def _dialect_name(session) -> str:
    """Return the synchronous dialect name behind an AsyncSession."""
    bind = session.sync_session.bind
    return bind.dialect.name if bind is not None else "postgresql"


async def persist_batch(items: Iterable[TelemetryEnvelope | SimulationEvent]) -> None:
    started = perf_counter()
    telemetry = [_telemetry_values(item) for item in items if isinstance(item, TelemetryEnvelope)]
    events = [_event_values(item) for item in items if isinstance(item, SimulationEvent)]
    if not telemetry and not events:
        return
    persisted_telemetry = 0
    async with SessionFactory() as session:
        try:
            dialect = _dialect_name(session)
            if telemetry:
                builder = pg_insert if dialect == "postgresql" else sqlite_insert if dialect == "sqlite" else insert
                statement = builder(TelemetrySample).values(telemetry)
                if hasattr(statement, "on_conflict_do_nothing"):
                    statement = statement.on_conflict_do_nothing(
                        index_elements=["run_id", "vehicle_id", "sequence"]
                    )
                result = await session.execute(statement)
                persisted_telemetry += max(result.rowcount or 0, 0)
            if events:
                builder = pg_insert if dialect == "postgresql" else sqlite_insert if dialect == "sqlite" else insert
                statement = builder(MissionEvent).values(events)
                if hasattr(statement, "on_conflict_do_nothing"):
                    statement = statement.on_conflict_do_nothing(index_elements=["id"])
                result = await session.execute(statement)
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("persistence batch failed")
            metrics.increment("persistence_errors_total")
            raise
        finally:
            metrics.increment("telemetry_messages_persisted_total", persisted_telemetry)
            metrics.observe("database_batch_write_duration_ms", (perf_counter() - started) * 1000)


class PersistenceWorker:
    """Bounded asynchronous batch writer kept off the simulator hot path."""

    def __init__(self, batch_size: int = 250, batch_window_seconds: float = 0.05) -> None:
        self.batch_size = batch_size
        self.batch_window_seconds = batch_window_seconds
        self.queue: asyncio.Queue[TelemetryEnvelope | SimulationEvent | None] = asyncio.Queue()
        self.task: asyncio.Task[None] | None = None
        self.error: Exception | None = None

    async def start(self) -> None:
        if self.task is None or self.task.done():
            self.error = None
            self.task = asyncio.create_task(self._run(), name="sentinel-persistence-worker")

    async def enqueue(self, item: TelemetryEnvelope | SimulationEvent) -> None:
        await self.queue.put(item)

    async def stop(self) -> None:
        if self.task is None:
            return
        await self.queue.join()
        await self.queue.put(None)
        await self.task
        self.task = None
        if self.error is not None:
            raise RuntimeError("durable persistence failed") from self.error

    async def _run(self) -> None:
        while True:
            first = await self.queue.get()
            if first is None:
                self.queue.task_done()
                return
            batch: list[TelemetryEnvelope | SimulationEvent] = [first]
            deadline = asyncio.get_running_loop().time() + self.batch_window_seconds
            while len(batch) < self.batch_size:
                timeout = deadline - asyncio.get_running_loop().time()
                if timeout <= 0:
                    break
                try:
                    item = await asyncio.wait_for(self.queue.get(), timeout)
                except asyncio.TimeoutError:
                    break
                if item is None:
                    self.queue.task_done()
                    break
                batch.append(item)
            try:
                for attempt in range(3):
                    try:
                        await persist_batch(batch)
                        break
                    except Exception as exc:
                        if attempt == 2:
                            self.error = exc
                            break
                        await asyncio.sleep(0.05 * (2**attempt))
            finally:
                for _ in batch:
                    self.queue.task_done()
