from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import FailureCreate
from app.db.models.entities import FailureInjection
from app.domain.enums import FailureType, RunStatus
from app.realtime.runner import coordinator
from app.services.run_service import RunConflict, get_run


class FailureNotFound(Exception):
    pass


async def inject_failure(session: AsyncSession, run_id: UUID, payload: FailureCreate) -> FailureInjection:
    run = await get_run(session, run_id)
    if run.status is not RunStatus.RUNNING:
        raise RunConflict(f"Failures can only be injected into RUNNING runs, not {run.status.value}")
    if not coordinator.is_active(run_id):
        raise RunConflict("The simulation coordinator is not active for this run")
    vehicle_ids = {vehicle.id for vehicle in run.run_vehicles}
    if payload.vehicle_id not in vehicle_ids:
        raise RunConflict("Vehicle does not belong to this run")
    failure_type = FailureType(payload.failure_type)
    started = coordinator.current_time_ms(run_id)
    failure = FailureInjection(
        run_id=run_id,
        vehicle_id=payload.vehicle_id,
        failure_type=failure_type,
        started_sim_time_ms=started,
        ended_sim_time_ms=started + payload.duration_ms,
        configuration=payload.configuration,
    )
    session.add(failure)
    await session.commit()
    await session.refresh(failure)
    await coordinator.inject_failure(run_id, failure.id, payload.vehicle_id, failure_type, payload.duration_ms, payload.configuration)
    return failure


async def list_failures(session: AsyncSession, run_id: UUID) -> list[FailureInjection]:
    await get_run(session, run_id)
    result = await session.execute(
        select(FailureInjection).where(FailureInjection.run_id == run_id).order_by(FailureInjection.created_at.desc())
    )
    return list(result.scalars().all())


async def clear_failure(session: AsyncSession, run_id: UUID, failure_id: UUID) -> FailureInjection:
    failure = await session.scalar(
        select(FailureInjection).where(FailureInjection.id == failure_id, FailureInjection.run_id == run_id)
    )
    if failure is None:
        raise FailureNotFound
    if failure.vehicle_id is None:
        raise RunConflict("A failure must target a run vehicle")
    if not coordinator.is_active(run_id):
        raise RunConflict("The simulation coordinator is not active for this run")
    failure.ended_sim_time_ms = coordinator.current_time_ms(run_id)
    await session.commit()
    await coordinator.clear_failure(run_id, failure_id, failure.vehicle_id)
    return failure
