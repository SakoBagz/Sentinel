from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.run_routes import to_run_read
from app.api.schemas import RunRead
from app.auth import AuthPrincipal, require_operator
from app.db.session import get_db_session
from app.services import audit_service, demo_service, run_service
from app.services.public_limits import session_key_from_subject

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/launch", response_model=RunRead)
async def launch_demo(
    session: AsyncSession = Depends(get_db_session),
    principal: AuthPrincipal = Depends(require_operator),
) -> RunRead:
    try:
        run = await demo_service.launch(session, session_key_from_subject(principal.subject))
        await audit_service.record_audit(
            session,
            principal=principal,
            action="demo.launch",
            resource_type="run",
            resource_id=run.id,
            details={"mission_id": str(run.mission_id)},
        )
        await session.commit()
        return to_run_read(run)
    except run_service.RunConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
