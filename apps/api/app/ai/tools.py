import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import EventRead, TelemetryRead
from app.db.models.entities import MissionEvent, TelemetrySample
from app.services.history_service import event_page, telemetry_page
from app.services.metrics_service import run_metrics
from app.services.run_service import RunNotFound, get_run

logger = logging.getLogger(__name__)
MAX_TOOL_ROWS = 100


async def _validated_run(session: AsyncSession, run_id: UUID):
    return await get_run(session, run_id)


async def _validated_vehicle(session: AsyncSession, run_id: UUID, vehicle_id: UUID):
    run = await _validated_run(session, run_id)
    vehicle = next((item for item in run.run_vehicles if item.id == vehicle_id), None)
    if vehicle is None:
        raise RunNotFound
    return run, vehicle


def _event_dict(event: MissionEvent) -> dict[str, Any]:
    return EventRead.model_validate(event).model_dump(mode="json")


def _telemetry_dict(sample: TelemetrySample) -> dict[str, Any]:
    return TelemetryRead.model_validate(sample).model_dump(mode="json")


async def get_run_summary(session: AsyncSession, run_id: UUID) -> dict[str, Any]:
    await _validated_run(session, run_id)
    result = await run_metrics(session, run_id)
    logger.info("analyst tool get_run_summary", extra={"run_id": str(run_id)})
    return {key: (str(value) if isinstance(value, UUID) else value) for key, value in result.items()}


async def get_vehicle_summary(session: AsyncSession, run_id: UUID, vehicle_id: UUID) -> dict[str, Any]:
    _, vehicle = await _validated_vehicle(session, run_id, vehicle_id)
    telemetry = list(
        (
            await session.execute(
                select(TelemetrySample)
                .where(TelemetrySample.run_id == run_id, TelemetrySample.vehicle_id == vehicle_id)
                .order_by(TelemetrySample.sim_time_ms.desc())
                .limit(1)
            )
        ).scalars().all()
    )
    events = list(
        (
            await session.execute(
                select(MissionEvent)
                .where(MissionEvent.run_id == run_id, MissionEvent.vehicle_id == vehicle_id)
                .order_by(MissionEvent.sim_time_ms.desc())
                .limit(MAX_TOOL_ROWS)
            )
        ).scalars().all()
    )
    last = telemetry[0] if telemetry else None
    logger.info("analyst tool get_vehicle_summary", extra={"run_id": str(run_id), "vehicle_id": str(vehicle_id)})
    return {
        "vehicle_id": str(vehicle_id),
        "callsign": vehicle.vehicle_definition.callsign,
        "latest_telemetry": _telemetry_dict(last) if last else None,
        "completed_waypoints": sum(1 for event in events if str(event.event_type) == "vehicle.waypoint_reached"),
        "important_events": [_event_dict(event) for event in reversed(events[:20])],
    }


async def get_vehicle_events(
    session: AsyncSession,
    run_id: UUID,
    vehicle_id: UUID,
    start_ms: int | None = None,
    end_ms: int | None = None,
) -> dict[str, Any]:
    await _validated_vehicle(session, run_id, vehicle_id)
    items, next_cursor = await event_page(
        session,
        run_id,
        start_ms=start_ms,
        end_ms=end_ms,
        limit=MAX_TOOL_ROWS,
        cursor=None,
        vehicle_id=vehicle_id,
        event_type=None,
        severity=None,
    )
    logger.info("analyst tool get_vehicle_events", extra={"run_id": str(run_id), "vehicle_id": str(vehicle_id)})
    return {"items": [_event_dict(item) for item in items], "next_cursor": next_cursor}


async def get_network_statistics(
    session: AsyncSession,
    run_id: UUID,
    vehicle_id: UUID | None = None,
    start_ms: int | None = None,
    end_ms: int | None = None,
) -> dict[str, Any]:
    if vehicle_id is not None:
        await _validated_vehicle(session, run_id, vehicle_id)
    else:
        await _validated_run(session, run_id)
    metrics = await run_metrics(session, run_id)
    if vehicle_id is not None:
        telemetry_query = select(TelemetrySample).where(
            TelemetrySample.run_id == run_id,
            TelemetrySample.vehicle_id == vehicle_id,
        )
        if start_ms is not None:
            telemetry_query = telemetry_query.where(TelemetrySample.sim_time_ms >= start_ms)
        if end_ms is not None:
            telemetry_query = telemetry_query.where(TelemetrySample.sim_time_ms < end_ms)
        samples = list((await session.execute(telemetry_query)).scalars().all())
        metrics = {
            "vehicle_id": str(vehicle_id),
            "telemetry_messages_received": len(samples),
            "communications_healthy_samples": sum(
                1 for sample in samples if str(sample.communications_state) == "HEALTHY"
            ),
            "communications_availability_percent": (
                sum(1 for sample in samples if str(sample.communications_state) == "HEALTHY") / len(samples) * 100
                if samples else 0.0
            ),
        }
    logger.info("analyst tool get_network_statistics", extra={"run_id": str(run_id), "vehicle_id": str(vehicle_id) if vehicle_id else None})
    return metrics


async def get_mission_events(
    session: AsyncSession,
    run_id: UUID,
    vehicle_id: UUID | None = None,
    severity: str | None = None,
    event_type: str | None = None,
    start_ms: int | None = None,
    end_ms: int | None = None,
) -> dict[str, Any]:
    items, next_cursor = await event_page(
        session,
        run_id,
        start_ms=start_ms,
        end_ms=end_ms,
        limit=MAX_TOOL_ROWS,
        cursor=None,
        vehicle_id=vehicle_id,
        event_type=event_type,
        severity=severity,
    )
    logger.info("analyst tool get_mission_events", extra={"run_id": str(run_id)})
    return {"items": [_event_dict(item) for item in items], "next_cursor": next_cursor}


async def get_vehicle_telemetry_range(
    session: AsyncSession,
    run_id: UUID,
    vehicle_id: UUID,
    start_ms: int,
    end_ms: int,
    sample_rate_hint: int = 10,
) -> dict[str, Any]:
    await _validated_vehicle(session, run_id, vehicle_id)
    items, next_cursor = await telemetry_page(
        session,
        run_id,
        start_ms=start_ms,
        end_ms=end_ms,
        limit=MAX_TOOL_ROWS,
        cursor=None,
        vehicle_id=vehicle_id,
    )
    stride = max(1, len(items) // max(1, min(sample_rate_hint, MAX_TOOL_ROWS)))
    logger.info("analyst tool get_vehicle_telemetry_range", extra={"run_id": str(run_id), "vehicle_id": str(vehicle_id)})
    return {"items": [_telemetry_dict(item) for item in items[::stride]], "next_cursor": next_cursor}
