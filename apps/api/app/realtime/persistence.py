import asyncio
import logging
from collections import deque
from collections.abc import Iterable
from datetime import datetime, timezone
from dataclasses import dataclass
from fractions import Fraction
from time import perf_counter

from sqlalchemy import insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.db.models.entities import MissionEvent, TelemetrySample
from app.db.session import SessionFactory
from app.observability.metrics import metrics
from sentinel_sim.models import SimulationEvent, TelemetryEnvelope

logger = logging.getLogger(__name__)


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    ordered = sorted(values)
    rank = percentile * (len(ordered) - 1)
    lower = int(rank)
    upper = min(len(ordered) - 1, lower + 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (rank - lower)


@dataclass(frozen=True)
class PersistBatchResult:
    telemetry_inserted: int
    events_inserted: int
    duration_ms: float


class TelemetryDownsampler:
    """Select deterministic simulation-time samples while retaining one final sample."""

    def __init__(self, persist_rate_hz: float | None) -> None:
        if persist_rate_hz is not None and persist_rate_hz <= 0:
            raise ValueError("persist_rate_hz must be positive")
        self.persist_rate_hz = persist_rate_hz
        self._period_ms = Fraction(1000) / Fraction(str(persist_rate_hz)) if persist_rate_hz else None
        self._next_due_ms: dict[object, Fraction] = {}
        self._latest: dict[object, TelemetryEnvelope] = {}
        self._last_selected_sequence: dict[object, int] = {}
        self._finalized = False

    def offer(self, sample: TelemetryEnvelope) -> bool:
        if self._finalized:
            raise RuntimeError("telemetry downsampler is already finalized")
        previous = self._latest.get(sample.vehicle_id)
        if previous is None or (sample.sim_time_ms, sample.sequence) > (previous.sim_time_ms, previous.sequence):
            self._latest[sample.vehicle_id] = sample
        if self._period_ms is None:
            self._last_selected_sequence[sample.vehicle_id] = sample.sequence
            return True
        next_due = self._next_due_ms.get(sample.vehicle_id)
        if next_due is None:
            # The first delivered sample is always retained. Subsequent samples
            # are selected against simulation-time buckets anchored at t=0.
            self._next_due_ms[sample.vehicle_id] = self._period_ms
            self._last_selected_sequence[sample.vehicle_id] = sample.sequence
            return True
        if sample.sim_time_ms < next_due:
            return False
        while next_due <= sample.sim_time_ms:
            next_due += self._period_ms
        self._next_due_ms[sample.vehicle_id] = next_due
        self._last_selected_sequence[sample.vehicle_id] = sample.sequence
        return True

    def final_samples(self) -> tuple[TelemetryEnvelope, ...]:
        if self._finalized:
            return ()
        self._finalized = True
        final: list[TelemetryEnvelope] = []
        for vehicle_id in sorted(self._latest, key=str):
            sample = self._latest[vehicle_id]
            if self._last_selected_sequence.get(vehicle_id) != sample.sequence:
                final.append(sample)
        return tuple(final)


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


async def persist_batch(items: Iterable[TelemetryEnvelope | SimulationEvent]) -> PersistBatchResult:
    started = perf_counter()
    telemetry = [_telemetry_values(item) for item in items if isinstance(item, TelemetryEnvelope)]
    events = [_event_values(item) for item in items if isinstance(item, SimulationEvent)]
    if not telemetry and not events:
        return PersistBatchResult(telemetry_inserted=0, events_inserted=0, duration_ms=0.0)
    persisted_telemetry = 0
    persisted_events = 0
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
                persisted_events += max(result.rowcount or 0, 0)
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("persistence batch failed")
            metrics.increment("persistence_errors_total")
            raise
        finally:
            metrics.increment("telemetry_messages_persisted_total", persisted_telemetry)
            duration_ms = (perf_counter() - started) * 1000
            metrics.observe("database_batch_write_duration_ms", duration_ms)
    return PersistBatchResult(
        telemetry_inserted=persisted_telemetry,
        events_inserted=persisted_events,
        duration_ms=duration_ms,
    )


class PersistenceWorker:
    """Bounded asynchronous batch writer kept off the simulator hot path."""

    def __init__(
        self,
        batch_size: int = 250,
        batch_window_seconds: float = 0.05,
        maxsize: int = 1_000,
        persist_rate_hz: float | None = None,
        *,
        queue_maxsize: int | None = None,
    ) -> None:
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")
        if batch_window_seconds <= 0:
            raise ValueError("batch_window_seconds must be positive")
        if queue_maxsize is not None:
            maxsize = queue_maxsize
        if maxsize <= 0:
            raise ValueError("maxsize must be positive")
        self.batch_size = batch_size
        self.batch_window_seconds = batch_window_seconds
        self.queue: asyncio.Queue[TelemetryEnvelope | SimulationEvent | None] = asyncio.Queue(maxsize=maxsize)
        self.downsampler = TelemetryDownsampler(persist_rate_hz)
        self.task: asyncio.Task[None] | None = None
        self.error: Exception | None = None
        self.persisted_telemetry = 0
        self.persisted_events = 0
        self.queue_high_water_mark = 0
        self._batch_durations: deque[float] = deque(maxlen=1_000)

    async def start(self) -> None:
        if self.task is None or self.task.done():
            self.error = None
            self.persisted_telemetry = 0
            self.persisted_events = 0
            self.queue_high_water_mark = self.queue.qsize()
            self.task = asyncio.create_task(self._run(), name="sentinel-persistence-worker")

    async def enqueue(self, item: TelemetryEnvelope | SimulationEvent) -> None:
        if isinstance(item, TelemetryEnvelope) and not self.downsampler.offer(item):
            return
        await self._put(item)

    async def finalize_telemetry(self) -> None:
        for sample in self.downsampler.final_samples():
            await self._put(sample)

    async def _put(self, item: TelemetryEnvelope | SimulationEvent | None) -> None:
        if self.task is None:
            raise RuntimeError("persistence worker is not started")
        if self.error is not None:
            raise RuntimeError("durable persistence failed") from self.error
        started = perf_counter()
        while True:
            try:
                await asyncio.wait_for(self.queue.put(item), timeout=0.25)
                break
            except asyncio.TimeoutError:
                if self.error is not None:
                    raise RuntimeError("durable persistence failed") from self.error
                if self.task.done():
                    self._capture_task_error()
                    raise RuntimeError("persistence worker stopped unexpectedly") from self.error
        waited_ms = (perf_counter() - started) * 1000
        if waited_ms >= 1:
            metrics.observe("persistence_backpressure_wait_ms", waited_ms)
        self.queue_high_water_mark = max(self.queue_high_water_mark, self.queue.qsize())
        metrics.set_gauge("persistence_queue_depth", self.queue.qsize())
        metrics.set_gauge("persistence_queue_high_water_mark", self.queue_high_water_mark)

    def _capture_task_error(self) -> None:
        if self.task is None or not self.task.done() or self.error is not None:
            return
        try:
            exception = self.task.exception()
        except asyncio.CancelledError as exc:
            exception = exc
        if exception is not None:
            self.error = exception

    async def stop(self) -> None:
        if self.task is None:
            return
        if not self.task.done():
            await self.queue.join()
            if not self.task.done():
                await self._put(None)
        await self.task
        self.task = None
        metrics.set_gauge("persistence_queue_depth", self.queue.qsize())
        if self.error is not None:
            raise RuntimeError("durable persistence failed") from self.error

    @property
    def batch_duration_percentiles(self) -> dict[str, float]:
        values = list(self._batch_durations)
        return {
            "p50": _percentile(values, 0.50),
            "p95": _percentile(values, 0.95),
            "p99": _percentile(values, 0.99),
        }

    def _drain_unfinished_items(self) -> None:
        while True:
            try:
                self.queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            else:
                self.queue.task_done()

    async def _run(self) -> None:
        try:
            while True:
                first = await self.queue.get()
                if first is None:
                    self.queue.task_done()
                    return
                batch: list[TelemetryEnvelope | SimulationEvent] = [first]
                deadline = asyncio.get_running_loop().time() + self.batch_window_seconds
                stop_after_batch = False
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
                        stop_after_batch = True
                        break
                    batch.append(item)
                try:
                    result: PersistBatchResult | None = None
                    for attempt in range(3):
                        try:
                            result = await persist_batch(batch)
                            break
                        except Exception as exc:
                            if attempt == 2:
                                self.error = exc
                                self._drain_unfinished_items()
                                return
                            await asyncio.sleep(0.05 * (2**attempt))
                    if result is not None:
                        self.persisted_telemetry += result.telemetry_inserted
                        self.persisted_events += result.events_inserted
                        self._batch_durations.append(result.duration_ms)
                finally:
                    for _ in batch:
                        self.queue.task_done()
                if stop_after_batch:
                    return
        except asyncio.CancelledError:
            self._drain_unfinished_items()
            raise
        except Exception as exc:
            self.error = exc
            self._drain_unfinished_items()
            logger.exception("persistence worker stopped unexpectedly")
