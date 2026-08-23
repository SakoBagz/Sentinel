from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import AuditEventRead
from app.auth import AuthPrincipal, require_reader
from app.db.session import get_db_session
from app.services import audit_service

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/events", response_model=list[AuditEventRead])
async def list_events(
    resource_type: str | None = Query(default=None),
    resource_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_db_session),
    _: AuthPrincipal = Depends(require_reader),
) -> list[AuditEventRead]:
    events = await audit_service.list_audit_events(
        session,
        resource_type=resource_type,
        resource_id=resource_id,
        limit=limit,
    )
    return [AuditEventRead.model_validate(event) for event in events]
