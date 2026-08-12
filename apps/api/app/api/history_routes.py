from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import EventPage, EventRead, MetricsRead, TelemetryPage, TelemetryRead
from app.db.session import get_db_session
from app.services import history_service, metrics_service
from app.services.run_service import RunNotFound

router = APIRouter(prefix="/runs/{run_id}", tags=["history"])


@router.get("/telemetry", response_model=TelemetryPage)
async def telemetry(
    run_id: UUID, start_ms: int | None = Query(default=None, ge=0), end_ms: int | None = Query(default=None, ge=0),
    limit: int = Query(default=500, ge=1, le=2_000), cursor: int | None = Query(default=None, ge=0), vehicle_id: UUID | None = None,
    session: AsyncSession = Depends(get_db_session),
) -> TelemetryPage:
    try:
        items, next_cursor = await history_service.telemetry_page(session, run_id, start_ms=start_ms, end_ms=end_ms, limit=limit, cursor=cursor, vehicle_id=vehicle_id)
        return TelemetryPage(items=[TelemetryRead.model_validate(item) for item in items], next_cursor=next_cursor)
    except RunNotFound as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc


@router.get("/events", response_model=EventPage)
async def events(
    run_id: UUID, start_ms: int | None = Query(default=None, ge=0), end_ms: int | None = Query(default=None, ge=0),
    limit: int = Query(default=500, ge=1, le=2_000), cursor: str | None = Query(default=None), vehicle_id: UUID | None = None,
    event_type: str | None = None, severity: str | None = None, session: AsyncSession = Depends(get_db_session),
) -> EventPage:
    try:
        items, next_cursor = await history_service.event_page(session, run_id, start_ms=start_ms, end_ms=end_ms, limit=limit, cursor=cursor, vehicle_id=vehicle_id, event_type=event_type, severity=severity)
        return EventPage(items=[EventRead.model_validate(item) for item in items], next_cursor=next_cursor)
    except RunNotFound as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/replay", response_model=TelemetryPage)
async def replay(
    run_id: UUID, start_ms: int | None = Query(default=None, ge=0), end_ms: int | None = Query(default=None, ge=0),
    limit: int = Query(default=1_000, ge=1, le=5_000), cursor: int | None = Query(default=None, ge=0), vehicle_id: UUID | None = None,
    session: AsyncSession = Depends(get_db_session),
) -> TelemetryPage:
    return await telemetry(run_id, start_ms, end_ms, limit, cursor, vehicle_id, session)


@router.get("/metrics", response_model=MetricsRead)
async def metrics(run_id: UUID, session: AsyncSession = Depends(get_db_session)) -> MetricsRead:
    try:
        return MetricsRead.model_validate(await metrics_service.run_metrics(session, run_id))
    except RunNotFound as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
