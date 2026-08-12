from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models.entities import Mission, MissionVehicle, SimulationRun


def session_key(session_id: str | None, forwarded_for: str | None) -> str:
    return (session_id or (forwarded_for.split(",", 1)[0].strip() if forwarded_for else "anonymous"))[:128]


async def ensure_vehicle_allowed(session: AsyncSession, mission_id: UUID, telemetry_rate_hz: float) -> None:
    settings = get_settings()
    if not settings.public_demo:
        return
    vehicle_ids = await session.execute(select(MissionVehicle.id).where(MissionVehicle.mission_id == mission_id))
    vehicle_count = len(vehicle_ids.scalars().all())
    if vehicle_count >= settings.effective_max_vehicles:
        raise ValueError(f"Public demo limit is {settings.effective_max_vehicles} vehicles per mission")
    if telemetry_rate_hz > settings.effective_max_telemetry_rate_hz:
        raise ValueError(f"Public demo telemetry rate limit is {settings.effective_max_telemetry_rate_hz:g} Hz")


async def ensure_run_allowed(session: AsyncSession, mission: Mission, session_id: str) -> None:
    settings = get_settings()
    if not settings.public_demo:
        return
    rows = await session.execute(select(SimulationRun.configuration))
    count = sum(1 for configuration in rows.scalars() if configuration.get("session_key") == session_id)
    if count >= settings.max_runs_per_session:
        raise ValueError(f"Public demo limit is {settings.max_runs_per_session} runs per session")
