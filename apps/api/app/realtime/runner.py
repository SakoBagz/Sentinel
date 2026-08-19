import asyncio
import logging
from collections import deque
from datetime import datetime, timezone
from time import perf_counter
from typing import Any
from uuid import UUID

from sqlalchemy import func, select

from app.config import get_settings
from app.domain.enums import EventSeverity, EventType, FailureType, MissionStatus, RunStatus
from app.db.models.entities import MissionEvent, RunTelemetrySummary, TelemetrySample
from app.db.session import SessionFactory
from app.realtime.redis import redis_client
from app.realtime.persistence import PersistenceWorker
from app.realtime.streams import publish_event, publish_telemetry
from app.observability.metrics import metrics
from app.services.run_service import _mission_to_simulation, get_run, network_profiles_for_run
from sentinel_sim.models import SimulationEvent, SimulationOutputs, deterministic_id
from sentinel_sim.engine import SimulationEngine

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


def _percentile_summary(values: deque[float]) -> dict[str, float]:
    samples = list(values)
    return {
        "p50": _percentile(samples, 0.50),
        "p95": _percentile(samples, 0.95),
        "p99": _percentile(samples, 0.99),
    }


class SimulationCoordinator:
    def __init__(self) -> None:
        self._tasks: dict[UUID, asyncio.Task[None]] = {}
        self._engines: dict[UUID, SimulationEngine] = {}
        self._pending_failures: dict[UUID, list[tuple[UUID, UUID, FailureType, int, dict]]] = {}
        self._wake_events: dict[UUID, asyncio.Event] = {}
        self._paused: set[UUID] = set()
        self._stop_requested: set[UUID] = set()
        self.last_run_diagnostics: dict[str, Any] | None = None

    async def start(self, run_id: UUID) -> None:
        task = self._tasks.get(run_id)
        if task is not None and not task.done():
            return
        self._paused.discard(run_id)
        self._stop_requested.discard(run_id)
        wake = self._wake_events.setdefault(run_id, asyncio.Event())
        wake.set()
        self._tasks[run_id] = asyncio.create_task(self._execute(run_id), name=f"sentinel-run-{run_id}")

    async def wait(self, run_id: UUID) -> None:
        task = self._tasks.get(run_id)
        if task is not None:
            await task

    def is_active(self, run_id: UUID) -> bool:
        task = self._tasks.get(run_id)
        return task is not None and not task.done()

    async def pause(self, run_id: UUID) -> None:
        if not self.is_active(run_id):
            return
        self._paused.add(run_id)
        self._wake_events.setdefault(run_id, asyncio.Event()).set()

    async def resume(self, run_id: UUID) -> None:
        self._paused.discard(run_id)
        self._wake_events.setdefault(run_id, asyncio.Event()).set()

    async def stop(self, run_id: UUID) -> None:
        if not self.is_active(run_id):
            return
        self._stop_requested.add(run_id)
        self._paused.discard(run_id)
        self._wake_events.setdefault(run_id, asyncio.Event()).set()

    def current_time_ms(self, run_id: UUID) -> int:
        engine = self._engines.get(run_id)
        return engine.clock.sim_time_ms if engine is not None else 0

    async def inject_failure(
        self, run_id: UUID, failure_id: UUID, vehicle_id: UUID, failure_type: FailureType, duration_ms: int, configuration: dict
    ) -> None:
        engine = self._engines.get(run_id)
        if engine is None:
            self._pending_failures.setdefault(run_id, []).append((failure_id, vehicle_id, failure_type, duration_ms, configuration))
            return
        engine.inject_failure(failure_id, vehicle_id, failure_type, duration_ms, configuration)

    async def clear_failure(self, run_id: UUID, failure_id: UUID, vehicle_id: UUID) -> None:
        engine = self._engines.get(run_id)
        if engine is None:
            pending = self._pending_failures.get(run_id, [])
            self._pending_failures[run_id] = [item for item in pending if item[0] != failure_id]
            return
        engine.clear_failure(failure_id, vehicle_id)

    async def _publish_outputs(
        self,
        simulation: SimulationEngine,
        outputs: SimulationOutputs,
        persistence: PersistenceWorker,
        diagnostics: dict[str, Any],
    ) -> None:
        metrics.increment("telemetry_messages_generated_total", len(outputs.generated_telemetry))
        for envelope in outputs.telemetry:
            publish_started = perf_counter()
            record_id = await publish_telemetry(redis_client, envelope)
            publish_duration_ms = (perf_counter() - publish_started) * 1000
            diagnostics["redis_publish_durations"].append(publish_duration_ms)
            metrics.observe("redis_publish_duration_ms", publish_duration_ms)
            if record_id is None:
                diagnostics["realtime_publish_errors"] += 1
                metrics.increment("realtime_publish_errors_total")
            # The live stream receives every delivered sample. The worker applies
            # persistence downsampling after this publish boundary.
            await persistence.enqueue(envelope)
        metrics.increment("telemetry_messages_received_total", len(outputs.telemetry))
        for event in outputs.events:
            publish_started = perf_counter()
            record_id = await publish_event(redis_client, event)
            publish_duration_ms = (perf_counter() - publish_started) * 1000
            diagnostics["redis_publish_durations"].append(publish_duration_ms)
            metrics.observe("event_processing_latency_ms", publish_duration_ms)
            if record_id is None:
                diagnostics["realtime_publish_errors"] += 1
                metrics.increment("realtime_publish_errors_total")
            await persistence.enqueue(event)
        for latency_ms in simulation.network.take_last_delivery_latencies():
            metrics.observe("telemetry_modeled_network_latency_ms", latency_ms)

    async def _execute(self, run_id: UUID) -> None:
        persistence: PersistenceWorker | None = None
        simulation: SimulationEngine | None = None
        diagnostics: dict[str, Any] = {
            "tick_durations": deque(maxlen=10_000),
            "redis_publish_durations": deque(maxlen=10_000),
            "realtime_publish_errors": 0,
        }
        try:
            async with SessionFactory() as session:
                run = await get_run(session, run_id)
                settings = get_settings()
                tick_hz = float(run.configuration.get("simulation_tick_hz", settings.simulation_tick_hz))
                persist_rate_hz = float(
                    run.configuration.get("telemetry_persist_rate_hz", settings.telemetry_persist_rate_hz)
                )
                queue_maxsize = int(
                    run.configuration.get("persistence_queue_maxsize", settings.persistence_queue_maxsize)
                )
                simulation = SimulationEngine(
                    _mission_to_simulation(run.mission, run),
                    run.id,
                    run.random_seed,
                    tick_hz=tick_hz,
                    network_profiles=network_profiles_for_run(run),
                    retain_history=False,
                )
                self._engines[run_id] = simulation
                metrics.set_gauge("simulation_vehicle_count", len(simulation.vehicles))
                for failure_id, vehicle_id, failure_type, duration_ms, configuration in self._pending_failures.pop(run_id, []):
                    simulation.inject_failure(failure_id, vehicle_id, failure_type, duration_ms, configuration)
                persistence = PersistenceWorker(maxsize=queue_maxsize, persist_rate_hz=persist_rate_hz)
                await persistence.start()
                try:
                    while not simulation.is_complete() and simulation.clock.sim_time_ms < simulation.mission.duration_limit_ms:
                        if run_id in self._stop_requested:
                            break
                        wake = self._wake_events.setdefault(run_id, asyncio.Event())
                        while run_id in self._paused and run_id not in self._stop_requested:
                            wake.clear()
                            await wake.wait()
                        if run_id in self._stop_requested:
                            break
                        tick_started = perf_counter()
                        simulation.tick()
                        tick_duration_ms = (perf_counter() - tick_started) * 1000
                        diagnostics["tick_durations"].append(tick_duration_ms)
                        metrics.observe("simulation_tick_duration_ms", tick_duration_ms)
                        outputs = simulation.drain_outputs()
                        await self._publish_outputs(simulation, outputs, persistence, diagnostics)
                        wake.clear()
                        try:
                            await asyncio.wait_for(
                                wake.wait(),
                                timeout=simulation.clock.tick_interval_ms / 1000 / max(run.simulation_speed, 0.01),
                            )
                        except asyncio.TimeoutError:
                            pass
                    simulation.flush_pending()
                    await self._publish_outputs(simulation, simulation.drain_outputs(), persistence, diagnostics)
                    await persistence.finalize_telemetry()
                finally:
                    await persistence.stop()
                network_stats = simulation.network.statistics()
                metrics.increment("telemetry_messages_missing_total", network_stats.missing_messages)
                metrics.increment("telemetry_messages_duplicate_total", network_stats.duplicate_messages)
                metrics.increment("telemetry_messages_out_of_order_total", network_stats.out_of_order_messages)
                persisted_messages = int(
                    await session.scalar(
                        select(func.count(TelemetrySample.id)).where(TelemetrySample.run_id == run_id)
                    )
                    or 0
                )
                stop_requested = run_id in self._stop_requested or run.status is RunStatus.ABORTED
                run.status = RunStatus.ABORTED if stop_requested else RunStatus.COMPLETED if simulation.is_complete() else RunStatus.ABORTED
                run.completed_at = datetime.now(timezone.utc)
                run.mission.status = MissionStatus.ABORTED if stop_requested else MissionStatus.COMPLETED if simulation.is_complete() else MissionStatus.ABORTED
                lifecycle_event: SimulationEvent | None = None
                if not stop_requested:
                    lifecycle_type = EventType.MISSION_COMPLETED if simulation.is_complete() else EventType.MISSION_ABORTED
                    lifecycle_event = SimulationEvent(
                        mission_id=run.mission_id,
                        run_id=run.id,
                        event_type=lifecycle_type,
                        severity=EventSeverity.INFO,
                        sim_time_ms=simulation.clock.sim_time_ms,
                        payload={"run_status": run.status.value},
                        event_id=deterministic_id(run.id, lifecycle_type.value, 0),
                    )
                    session.add(
                        MissionEvent(
                            id=lifecycle_event.event_id,
                            run_id=lifecycle_event.run_id,
                            vehicle_id=None,
                            event_type=lifecycle_event.event_type,
                            severity=lifecycle_event.severity,
                            schema_version=lifecycle_event.schema_version,
                            sim_time_ms=lifecycle_event.sim_time_ms,
                            timestamp=lifecycle_event.timestamp,
                            payload=lifecycle_event.payload,
                        )
                    )
                session.add(
                    RunTelemetrySummary(
                        run_id=run.id,
                        generated_messages=network_stats.generated_messages,
                        delivered_messages=network_stats.delivered_messages,
                        unique_delivered_messages=network_stats.unique_delivered_messages,
                        persisted_messages=persisted_messages,
                        missing_messages=network_stats.missing_messages,
                        duplicate_messages=network_stats.duplicate_messages,
                        out_of_order_messages=network_stats.out_of_order_messages,
                        healthy_delivered_messages=network_stats.healthy_delivered_messages,
                        modeled_latency_p50_ms=network_stats.modeled_latency_p50_ms,
                        modeled_latency_p95_ms=network_stats.modeled_latency_p95_ms,
                        modeled_latency_p99_ms=network_stats.modeled_latency_p99_ms,
                        persistence_queue_high_water_mark=persistence.queue_high_water_mark,
                        simulated_mission_duration_ms=simulation.clock.sim_time_ms,
                    )
                )
                await session.commit()
                if lifecycle_event is not None:
                    await publish_event(redis_client, lifecycle_event)
                logger.info("simulation run completed", extra={"run_id": str(run_id), "sim_time_ms": simulation.clock.sim_time_ms})
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("simulation run failed", extra={"run_id": str(run_id)})
            try:
                async with SessionFactory() as failure_session:
                    failed_run = await get_run(failure_session, run_id)
                    if failed_run.status is RunStatus.RUNNING:
                        failed_run.status = RunStatus.ABORTED
                        failed_run.completed_at = datetime.now(timezone.utc)
                        failed_run.mission.status = MissionStatus.ABORTED
                        await failure_session.commit()
            except Exception:
                logger.exception("could not mark failed run aborted", extra={"run_id": str(run_id)})
        finally:
            diagnostics["tick_latency_ms"] = _percentile_summary(diagnostics["tick_durations"])
            diagnostics["redis_publish_duration_ms"] = _percentile_summary(diagnostics["redis_publish_durations"])
            diagnostics["database_batch_duration_ms"] = (
                persistence.batch_duration_percentiles if persistence is not None else {"p50": 0.0, "p95": 0.0, "p99": 0.0}
            )
            diagnostics["errors"] = diagnostics["realtime_publish_errors"] + (1 if persistence and persistence.error else 0)
            diagnostics.pop("tick_durations", None)
            diagnostics.pop("redis_publish_durations", None)
            self.last_run_diagnostics = diagnostics
            self._engines.pop(run_id, None)
            self._pending_failures.pop(run_id, None)
            self._wake_events.pop(run_id, None)
            self._paused.discard(run_id)
            self._stop_requested.discard(run_id)
            self._tasks.pop(run_id, None)

    async def stop_all(self) -> None:
        tasks = list(self._tasks.values())
        self._stop_requested.update(self._tasks)
        for wake in self._wake_events.values():
            wake.set()
        self._tasks.clear()
        for task in tasks:
            task.cancel()
        for task in tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass


coordinator = SimulationCoordinator()
