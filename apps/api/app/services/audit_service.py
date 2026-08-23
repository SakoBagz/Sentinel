from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthPrincipal
from app.db.models.entities import AuditEvent


async def record_audit(
    session: AsyncSession,
    *,
    principal: AuthPrincipal,
    action: str,
    resource_type: str,
    resource_id: str | UUID | None = None,
    details: dict[str, Any] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        actor_subject=principal.subject,
        actor_role=principal.role.value,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        details=details or {},
    )
    session.add(event)
    await session.flush()
    return event


async def list_audit_events(
    session: AsyncSession,
    *,
    resource_type: str | None = None,
    resource_id: str | None = None,
    limit: int = 100,
) -> list[AuditEvent]:
    statement = select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit)
    if resource_type:
        statement = statement.where(AuditEvent.resource_type == resource_type)
    if resource_id:
        statement = statement.where(AuditEvent.resource_id == resource_id)
    result = await session.execute(statement)
    return list(result.scalars().all())
