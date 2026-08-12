import logging
import time
from collections import defaultdict, deque
from uuid import UUID

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import tools
from app.ai.providers import (
    AnalystProviderError,
    AnalystProviderUnavailable,
    provider_for,
)
from app.ai.schemas import AnalystContext, AnalystResult
from app.api.schemas import AnalystRequest
from app.config import get_settings
from app.db.models.entities import Debrief
from app.services.run_service import RunNotFound, get_run

logger = logging.getLogger(__name__)


class AnalystQuotaExceeded(Exception):
    pass


class AnalystRateLimited(Exception):
    pass


class AnalystService:
    def __init__(self) -> None:
        self._counts: defaultdict[tuple[str, str], int] = defaultdict(int)
        self._recent: defaultdict[tuple[str, str], deque[float]] = defaultdict(deque)

    def _consume(self, run_id: UUID, session_key: str) -> None:
        settings = get_settings()
        key = (session_key[:128], str(run_id))
        now = time.monotonic()
        recent = self._recent[key]
        while recent and recent[0] <= now - 1.0:
            recent.popleft()
        if recent:
            raise AnalystRateLimited("Mission Analyst requests are rate limited")
        if self._counts[key] >= settings.max_ai_questions_per_run:
            raise AnalystQuotaExceeded("Mission Analyst question quota exceeded for this run")
        recent.append(now)
        self._counts[key] += 1

    async def _context(self, session: AsyncSession, run_id: UUID, message: str) -> AnalystContext:
        run = await get_run(session, run_id)
        summary = await tools.get_run_summary(session, run_id)
        event_page = await tools.get_mission_events(session, run_id)
        vehicle_summaries = []
        normalized = message.casefold()
        for vehicle in run.run_vehicles:
            if vehicle.vehicle_definition.callsign.casefold() in normalized or str(vehicle.id) in message:
                vehicle_summaries.append(await tools.get_vehicle_summary(session, run_id, vehicle.id))
        network_statistics = None
        if any(term in normalized for term in ("network", "communication", "latency", "packet", "disconnect")):
            network_statistics = await tools.get_network_statistics(session, run_id)
        return AnalystContext(
            run_summary=summary,
            mission_events=event_page["items"],
            vehicle_summaries=vehicle_summaries,
            network_statistics=network_statistics,
        )

    @staticmethod
    def _validate_evidence(result: AnalystResult, context: AnalystContext) -> AnalystResult:
        allowed = {str(event.get("id")) for event in context.mission_events}
        for vehicle in context.vehicle_summaries:
            allowed.update(str(event.get("id")) for event in vehicle.get("important_events", []))
        invalid = [evidence.event_id for evidence in result.evidence if str(evidence.event_id) not in allowed]
        if invalid:
            raise AnalystProviderError("Mission Analyst returned evidence outside the queried run")
        return result

    async def analyze(
        self,
        session: AsyncSession,
        run_id: UUID,
        request: AnalystRequest,
        session_key: str,
    ) -> AnalystResult:
        self._consume(run_id, session_key)
        context = await self._context(session, run_id, request.message)
        provider = provider_for(get_settings().ai_provider, get_settings().gemini_api_key)
        result = await provider.analyze(run_id, request.message, context)
        if result.run_id != run_id:
            raise AnalystProviderError("Mission Analyst returned a mismatched run identifier")
        return self._validate_evidence(result, context)

    async def debrief(self, session: AsyncSession, run_id: UUID, session_key: str) -> AnalystResult:
        await get_run(session, run_id)
        existing = await session.scalar(
            select(Debrief)
            .where(Debrief.run_id == run_id)
            .order_by(desc(Debrief.generated_at))
            .limit(1)
        )
        if existing is not None and existing.structured_result:
            return AnalystResult.model_validate(existing.structured_result)
        result = await self.analyze(
            session,
            run_id,
            AnalystRequest(message="Generate a factual structured post-mission debrief."),
            session_key,
        )
        session.add(
            Debrief(
                run_id=run_id,
                provider=result.provider,
                model=result.model,
                structured_result=result.model_dump(mode="json"),
            )
        )
        await session.commit()
        return result


analyst_service = AnalystService()
