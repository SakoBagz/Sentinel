from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.entities import MissionEvent, SimulationRun, TelemetrySample
from app.services.run_service import get_run


async def run_snapshot(session: AsyncSession, run_id: UUID) -> tuple[SimulationRun, list[TelemetrySample | None]]:
    run = await get_run(session, run_id)
    latest: list[TelemetrySample | None] = []
    for vehicle in run.run_vehicles:
        result = await session.execute(
            select(TelemetrySample)
            .where(TelemetrySample.run_id == run_id, TelemetrySample.vehicle_id == vehicle.id)
            .order_by(TelemetrySample.sim_time_ms.desc(), TelemetrySample.sequence.desc())
            .limit(1)
        )
        latest.append(result.scalar_one_or_none())
    return run, latest


async def telemetry_page(
    session: AsyncSession, run_id: UUID, *, start_ms: int | None, end_ms: int | None,
    limit: int, cursor: int | None, vehicle_id: UUID | None,
) -> tuple[list[TelemetrySample], str | None]:
    await get_run(session, run_id)
    query = select(TelemetrySample).where(TelemetrySample.run_id == run_id)
    if start_ms is not None:
        query = query.where(TelemetrySample.sim_time_ms >= start_ms)
    if end_ms is not None:
        query = query.where(TelemetrySample.sim_time_ms < end_ms)
    if cursor is not None:
        query = query.where(TelemetrySample.id > cursor)
    if vehicle_id is not None:
        query = query.where(TelemetrySample.vehicle_id == vehicle_id)
    query = query.order_by(TelemetrySample.id).limit(limit + 1)
    items = list((await session.execute(query)).scalars().all())
    next_cursor = None
    if len(items) > limit:
        items.pop()
        next_cursor = str(items[-1].id)
    return items, next_cursor


async def replay_sample(
    session: AsyncSession, run_id: UUID, *, start_ms: int | None, end_ms: int | None,
    limit: int, vehicle_id: UUID | None,
) -> list[TelemetrySample]:
    """Return a bounded persisted sample spanning the requested replay window."""
    await get_run(session, run_id)
    filters = [TelemetrySample.run_id == run_id]
    if start_ms is not None:
        filters.append(TelemetrySample.sim_time_ms >= start_ms)
    if end_ms is not None:
        filters.append(TelemetrySample.sim_time_ms < end_ms)
    if vehicle_id is not None:
        filters.append(TelemetrySample.vehicle_id == vehicle_id)
    counts = list((await session.execute(
        select(TelemetrySample.vehicle_id, func.count(TelemetrySample.id))
        .where(*filters).group_by(TelemetrySample.vehicle_id)
    )).all())
    total = sum(count for _, count in counts)
    if total <= limit:
        result = await session.execute(
            select(TelemetrySample).where(*filters)
            .order_by(TelemetrySample.sim_time_ms, TelemetrySample.id)
        )
        return list(result.scalars().all())
    allocation = max(1, limit // len(counts))
    ranked = select(
        TelemetrySample.id.label("id"),
        func.row_number().over(
            partition_by=TelemetrySample.vehicle_id,
            order_by=(TelemetrySample.sim_time_ms, TelemetrySample.id),
        ).label("row_number"),
        func.count(TelemetrySample.id).over(
            partition_by=TelemetrySample.vehicle_id,
        ).label("vehicle_count"),
    ).where(*filters).subquery()
    if allocation == 1:
        selected_ids = select(ranked.c.id).where(ranked.c.row_number == ranked.c.vehicle_count)
    else:
        max_vehicle_count = max(count for _, count in counts)
        stride = max(1, (max_vehicle_count - 1 + allocation - 2) // (allocation - 1))
        selected_ids = select(ranked.c.id).where(or_(
            ranked.c.row_number == 1,
            ranked.c.row_number == ranked.c.vehicle_count,
            (ranked.c.row_number - 1) % stride == 0,
        ))
    result = await session.execute(
        select(TelemetrySample).where(TelemetrySample.id.in_(selected_ids))
        .order_by(TelemetrySample.sim_time_ms, TelemetrySample.id).limit(limit)
    )
    return list(result.scalars().all())


async def event_page(
    session: AsyncSession, run_id: UUID, *, start_ms: int | None, end_ms: int | None,
    limit: int, cursor: str | None, vehicle_id: UUID | None, event_type: str | None, severity: str | None,
) -> tuple[list[MissionEvent], str | None]:
    await get_run(session, run_id)
    query = select(MissionEvent).where(MissionEvent.run_id == run_id)
    if start_ms is not None:
        query = query.where(MissionEvent.sim_time_ms >= start_ms)
    if end_ms is not None:
        query = query.where(MissionEvent.sim_time_ms < end_ms)
    if cursor is not None:
        try:
            cursor_time_text, cursor_id_text = cursor.split(":", 1)
            cursor_time = int(cursor_time_text)
            cursor_id = UUID(cursor_id_text)
        except (ValueError, TypeError) as exc:
            raise ValueError("Invalid event cursor") from exc
        query = query.where(
            or_(
                MissionEvent.sim_time_ms > cursor_time,
                and_(MissionEvent.sim_time_ms == cursor_time, MissionEvent.id > cursor_id),
            )
        )
    if vehicle_id is not None:
        query = query.where(MissionEvent.vehicle_id == vehicle_id)
    if event_type is not None:
        query = query.where(MissionEvent.event_type == event_type)
    if severity is not None:
        query = query.where(MissionEvent.severity == severity)
    query = query.order_by(MissionEvent.sim_time_ms, MissionEvent.id).limit(limit + 1)
    items = list((await session.execute(query)).scalars().all())
    next_cursor = None
    if len(items) > limit:
        items.pop()
        next_cursor = f"{items[-1].sim_time_ms}:{items[-1].id}"
    return items, next_cursor
