from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.run_routes import to_run_read
from app.api.schemas import RunRead
from app.db.session import get_db_session
from app.services import demo_service, run_service
from app.services.public_limits import session_key

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/launch", response_model=RunRead)
async def launch_demo(
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
    x_session_id: str | None = Header(default=None),
    x_forwarded_for: str | None = Header(default=None),
) -> RunRead:
    try:
        run = await demo_service.launch(session, session_key(x_session_id, x_forwarded_for))
        return to_run_read(run)
    except run_service.RunConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
