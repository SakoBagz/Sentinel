from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.providers import AnalystProviderError, AnalystProviderUnavailable
from app.ai.service import AnalystQuotaExceeded, AnalystRateLimited, analyst_service
from app.api.schemas import AnalystRequest, AnalystResponse
from app.db.session import get_db_session
from app.services.run_service import RunNotFound

router = APIRouter(prefix="/runs/{run_id}", tags=["analyst"])


def _response(result) -> AnalystResponse:
    return AnalystResponse.model_validate(result.model_dump(mode="json"))


def _session_key(x_session_id: str | None, x_forwarded_for: str | None) -> str:
    return x_session_id or (x_forwarded_for.split(",", 1)[0].strip() if x_forwarded_for else "anonymous")


@router.post("/assistant", response_model=AnalystResponse)
async def assistant(
    run_id: UUID,
    payload: AnalystRequest,
    session: AsyncSession = Depends(get_db_session),
    x_session_id: str | None = Header(default=None),
    x_forwarded_for: str | None = Header(default=None),
) -> AnalystResponse:
    try:
        result = await analyst_service.analyze(
            session,
            run_id,
            payload,
            _session_key(x_session_id, x_forwarded_for),
        )
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
    x_session_id: str | None = Header(default=None),
    x_forwarded_for: str | None = Header(default=None),
) -> AnalystResponse:
    try:
        result = await analyst_service.debrief(
            session,
            run_id,
            _session_key(x_session_id, x_forwarded_for),
        )
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
