from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.providers import AnalystProviderError, AnalystProviderUnavailable
from app.ai.service import AnalystQuotaExceeded, AnalystRateLimited, analyst_service
from app.api.schemas import AnalystRequest, AnalystResponse
from app.auth import AuthPrincipal, require_reader
from app.db.session import get_db_session
from app.services import audit_service
from app.services.public_limits import session_key_from_subject
from app.services.run_service import RunNotFound

router = APIRouter(prefix="/runs/{run_id}", tags=["analyst"])


def _response(result) -> AnalystResponse:
    return AnalystResponse.model_validate(result.model_dump(mode="json"))


@router.post("/assistant", response_model=AnalystResponse)
async def assistant(
    run_id: UUID,
    payload: AnalystRequest,
    session: AsyncSession = Depends(get_db_session),
    principal: AuthPrincipal = Depends(require_reader),
) -> AnalystResponse:
    try:
        result = await analyst_service.analyze(
            session,
            run_id,
            payload,
            session_key_from_subject(principal.subject),
        )
        await audit_service.record_audit(
            session,
            principal=principal,
            action="analysis.assistant",
            resource_type="run",
            resource_id=run_id,
        )
        await session.commit()
        return _response(result)
    except RunNotFound as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    except AnalystRateLimited as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except AnalystQuotaExceeded as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except AnalystProviderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AnalystProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/debrief", response_model=AnalystResponse)
async def debrief(
    run_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    principal: AuthPrincipal = Depends(require_reader),
) -> AnalystResponse:
    try:
        result = await analyst_service.debrief(
            session,
            run_id,
            session_key_from_subject(principal.subject),
        )
        await audit_service.record_audit(
            session,
            principal=principal,
            action="analysis.debrief",
            resource_type="run",
            resource_id=run_id,
        )
        await session.commit()
        return _response(result)
    except RunNotFound as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    except AnalystRateLimited as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except AnalystQuotaExceeded as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except AnalystProviderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AnalystProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
