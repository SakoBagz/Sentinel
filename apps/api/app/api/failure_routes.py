from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import FailureCreate, FailureRead
from app.auth import AuthPrincipal, require_operator
from app.db.session import get_db_session
from app.services import audit_service, failure_service
from app.services.run_service import RunConflict, RunNotFound

router = APIRouter(prefix="/runs/{run_id}/failures", tags=["failures"])


@router.post("", response_model=FailureRead, status_code=201)
async def create_failure(
    run_id: UUID,
    payload: FailureCreate,
    session: AsyncSession = Depends(get_db_session),
    principal: AuthPrincipal = Depends(require_operator),
) -> FailureRead:
    try:
        failure = await failure_service.inject_failure(session, run_id, payload)
        await audit_service.record_audit(
            session,
            principal=principal,
            action="failure.inject",
            resource_type="run",
            resource_id=run_id,
            details={"failure_id": str(failure.id), "failure_type": failure.failure_type.value},
        )
        await session.commit()
        return FailureRead.model_validate(failure)
    except RunNotFound as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    except RunConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("", response_model=list[FailureRead])
async def get_failures(run_id: UUID, session: AsyncSession = Depends(get_db_session)) -> list[FailureRead]:
    try:
        return [FailureRead.model_validate(item) for item in await failure_service.list_failures(session, run_id)]
    except RunNotFound as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc


@router.delete("/{failure_id}", response_model=FailureRead)
async def clear_failure(
    run_id: UUID,
    failure_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    principal: AuthPrincipal = Depends(require_operator),
) -> FailureRead:
    try:
        failure = await failure_service.clear_failure(session, run_id, failure_id)
        await audit_service.record_audit(
            session,
            principal=principal,
            action="failure.clear",
            resource_type="run",
            resource_id=run_id,
            details={"failure_id": str(failure_id)},
        )
        await session.commit()
        return FailureRead.model_validate(failure)
    except failure_service.FailureNotFound as exc:
        raise HTTPException(status_code=404, detail="Failure not found") from exc
    except RunConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
