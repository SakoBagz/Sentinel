"""Demo JWT session auth (portfolio-grade; not a production IdP)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import StrEnum
from typing import Any
from uuid import uuid4

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

bearer_scheme = HTTPBearer(auto_error=False)


class Role(StrEnum):
    OPERATOR = "operator"
    OBSERVER = "observer"


@dataclass(frozen=True)
class AuthPrincipal:
    subject: str
    role: Role
    token_id: str

    @property
    def can_mutate(self) -> bool:
        return self.role == Role.OPERATOR


def _secret() -> str:
    settings = get_settings()
    return settings.auth_secret


def issue_token(*, role: Role, subject: str | None = None, expires_hours: int | None = None) -> dict[str, Any]:
    settings = get_settings()
    sub = subject or str(uuid4())
    hours = expires_hours if expires_hours is not None else settings.auth_token_ttl_hours
    now = datetime.now(timezone.utc)
    token_id = str(uuid4())
    payload = {
        "sub": sub,
        "role": role.value,
        "jti": token_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=hours)).timestamp()),
        "iss": "sentinel-demo",
    }
    token = jwt.encode(payload, _secret(), algorithm="HS256")
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": role.value,
        "subject": sub,
        "expires_at": (now + timedelta(hours=hours)).isoformat(),
    }


def decode_token(token: str) -> AuthPrincipal:
    try:
        payload = jwt.decode(token, _secret(), algorithms=["HS256"], issuer="sentinel-demo")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired session token") from exc
    role_value = payload.get("role")
    subject = payload.get("sub")
    token_id = payload.get("jti")
    if not subject or not token_id or role_value not in {Role.OPERATOR.value, Role.OBSERVER.value}:
        raise HTTPException(status_code=401, detail="Malformed session token")
    return AuthPrincipal(subject=str(subject), role=Role(role_value), token_id=str(token_id))


async def optional_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthPrincipal | None:
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    return decode_token(credentials.credentials)


async def require_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthPrincipal:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentication required")
    return decode_token(credentials.credentials)


async def require_operator(principal: AuthPrincipal = Depends(require_principal)) -> AuthPrincipal:
    if not principal.can_mutate:
        raise HTTPException(status_code=403, detail="Operator role required")
    return principal


async def require_reader(principal: AuthPrincipal = Depends(require_principal)) -> AuthPrincipal:
    """Observer or operator may read protected history surfaces."""
    return principal


def principal_from_query_token(token: str | None) -> AuthPrincipal:
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    return decode_token(token)


def request_principal(request: Request) -> AuthPrincipal | None:
    return getattr(request.state, "principal", None)
