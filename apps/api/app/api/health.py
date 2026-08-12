
from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.db.session import engine
from app.realtime.redis import redis_client

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    service: str
    dependencies: dict[str, str]


async def _check_postgres() -> str:
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return "ok"
    except Exception:
        return "unavailable"


async def _check_redis() -> str:
    try:
        await redis_client.ping()
        return "ok"
    except Exception:
        return "unavailable"


@router.get("", response_model=HealthResponse)
async def health() -> HealthResponse:
    postgres, redis = await _check_postgres(), await _check_redis()
    dependencies: dict[str, str] = {"postgres": postgres, "redis": redis}
    status = "ok" if all(value == "ok" for value in dependencies.values()) else "degraded"
    return HealthResponse(status=status, service="api", dependencies=dependencies)

