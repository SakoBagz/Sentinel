from fastapi import APIRouter, Depends

from app.api.schemas import AuthSessionCreate, AuthSessionRead, PrincipalRead
from app.auth import AuthPrincipal, Role, issue_token, require_principal

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/session", response_model=AuthSessionRead)
async def create_session(payload: AuthSessionCreate) -> AuthSessionRead:
    role = Role(payload.role)
    issued = issue_token(role=role, subject=payload.subject)
    return AuthSessionRead.model_validate(issued)


@router.get("/me", response_model=PrincipalRead)
async def current_session(principal: AuthPrincipal = Depends(require_principal)) -> PrincipalRead:
    return PrincipalRead(subject=principal.subject, role=principal.role.value, token_id=principal.token_id)
