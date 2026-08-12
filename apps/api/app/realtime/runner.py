import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

from app.db.session import SessionFactory
from app.realtime.redis import redis_client
from app.realtime.streams import publish_event, publish_telemetry
from app.services.run_service import _mission_to_simulation, get_run
from app.domain.enums import MissionStatus, RunStatus
from sentinel_sim.engine import SimulationEngine

logger = logging.getLogger(__name__)


class SimulationCoordinator:
    def __init__(self) -> None:
        self._tasks: dict[UUID, asyncio.Task[None]] = {}

    async def start(self, run_id: UUID) -> None:
        task = self._tasks.get(run_id)
        if task is not None and not task.done():
            return
        self._tasks[run_id] = asyncio.create_task(self._execute(run_id), name=f"sentinel-run-{run_id}")

    async def wait(self, run_id: UUID) -> None:
        task = self._tasks.get(run_id)
        if task is not None:
            await task

    async def _execute(self, run_id: UUID) -> None:
        try:
            async with SessionFactory() as session:
                run = await get_run(session, run_id)
                simulation = SimulationEngine(
                    _mission_to_simulation(run.mission, run),
                    run.id,
                    run.random_seed,
                    tick_hz=10.0,
                    telemetry_rate_hz=10.0,
                )
                sent_telemetry = 0
                sent_events = 0
                while not simulation.is_complete() and simulation.clock.sim_time_ms < simulation.mission.duration_limit_ms:
                    simulation.tick()
                    for envelope in simulation.telemetry[sent_telemetry:]:
                        await publish_telemetry(redis_client, envelope)
                    sent_telemetry = len(simulation.telemetry)
                    for event in simulation.events[sent_events:]:
                        await publish_event(redis_client, event)
                    sent_events = len(simulation.events)
                    await asyncio.sleep(simulation.clock.tick_interval_ms / 1000 / max(run.simulation_speed, 0.01))
                run.status = RunStatus.COMPLETED if simulation.is_complete() else RunStatus.ABORTED
                run.completed_at = datetime.now(timezone.utc)
                run.mission.status = MissionStatus.COMPLETED if simulation.is_complete() else MissionStatus.ABORTED
                await session.commit()
                logger.info("simulation run completed", extra={"run_id": str(run_id), "sim_time_ms": simulation.clock.sim_time_ms})
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("simulation run failed", extra={"run_id": str(run_id)})
        finally:
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
