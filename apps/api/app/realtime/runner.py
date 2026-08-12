import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

from app.domain.enums import FailureType
from app.db.session import SessionFactory
from app.realtime.redis import redis_client
from app.realtime.persistence import PersistenceWorker
from app.realtime.streams import publish_event, publish_telemetry
from app.services.run_service import _mission_to_simulation, get_run, network_profiles_for_run
from app.domain.enums import MissionStatus, RunStatus
from sentinel_sim.engine import SimulationEngine

logger = logging.getLogger(__name__)


class SimulationCoordinator:
    def __init__(self) -> None:
        self._tasks: dict[UUID, asyncio.Task[None]] = {}
        self._engines: dict[UUID, SimulationEngine] = {}
        self._pending_failures: dict[UUID, list[tuple[UUID, UUID, FailureType, int, dict]]] = {}

    async def start(self, run_id: UUID) -> None:
        task = self._tasks.get(run_id)
        if task is not None and not task.done():
            return
        self._tasks[run_id] = asyncio.create_task(self._execute(run_id), name=f"sentinel-run-{run_id}")

    async def wait(self, run_id: UUID) -> None:
        task = self._tasks.get(run_id)
        if task is not None:
            await task

    def is_active(self, run_id: UUID) -> bool:
        task = self._tasks.get(run_id)
        return task is not None and not task.done()

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

    async def _execute(self, run_id: UUID) -> None:
        persistence: PersistenceWorker | None = None
        try:
            async with SessionFactory() as session:
                run = await get_run(session, run_id)
                simulation = SimulationEngine(
                    _mission_to_simulation(run.mission, run),
                    run.id,
                    run.random_seed,
                    tick_hz=10.0,
                    telemetry_rate_hz=10.0,
                    network_profiles=network_profiles_for_run(run),
                )
                self._engines[run_id] = simulation
                for failure_id, vehicle_id, failure_type, duration_ms, configuration in self._pending_failures.pop(run_id, []):
                    simulation.inject_failure(failure_id, vehicle_id, failure_type, duration_ms, configuration)
                sent_telemetry = 0
                sent_events = 0
                persistence = PersistenceWorker()
                await persistence.start()
                try:
                    while not simulation.is_complete() and simulation.clock.sim_time_ms < simulation.mission.duration_limit_ms:
                        simulation.tick()
                        for envelope in simulation.telemetry[sent_telemetry:]:
                            await publish_telemetry(redis_client, envelope)
                            await persistence.enqueue(envelope)
                        sent_telemetry = len(simulation.telemetry)
                        for event in simulation.events[sent_events:]:
                            await publish_event(redis_client, event)
                            await persistence.enqueue(event)
                        sent_events = len(simulation.events)
                        await asyncio.sleep(simulation.clock.tick_interval_ms / 1000 / max(run.simulation_speed, 0.01))
                finally:
                    await persistence.stop()
                run.status = RunStatus.COMPLETED if simulation.is_complete() else RunStatus.ABORTED
                run.completed_at = datetime.now(timezone.utc)
                run.mission.status = MissionStatus.COMPLETED if simulation.is_complete() else MissionStatus.ABORTED
                await session.commit()
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
            self._engines.pop(run_id, None)
            self._pending_failures.pop(run_id, None)
            self._tasks.pop(run_id, None)

    async def stop_all(self) -> None:
        tasks = list(self._tasks.values())
        self._tasks.clear()
        for task in tasks:
            task.cancel()
        for task in tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass


coordinator = SimulationCoordinator()
