#!/usr/bin/env python3
"""Delete old run history while preserving the newest runs and demo mission."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, select

from app.db.models.entities import Debrief, FailureInjection, MissionEvent, SimulationRun, TelemetrySample
from app.db.session import SessionFactory


async def cleanup(keep_runs: int, preserve_mission: UUID | None, before: datetime | None, apply: bool) -> int:
    async with SessionFactory() as session:
        query = select(SimulationRun).order_by(SimulationRun.created_at.desc())
        runs = list((await session.execute(query)).scalars().all())
        kept = {run.id for run in runs[:keep_runs]}
        targets = [
            run
            for run in runs[keep_runs:]
            if run.id not in kept
            and (preserve_mission is None or run.mission_id != preserve_mission)
            and (before is None or (run.created_at and run.created_at < before))
        ]
        if not apply:
            print(f"dry-run: {len(targets)} runs eligible for removal")
            return len(targets)
        for run in targets:
            await session.execute(delete(TelemetrySample).where(TelemetrySample.run_id == run.id))
            await session.execute(delete(MissionEvent).where(MissionEvent.run_id == run.id))
            await session.execute(delete(FailureInjection).where(FailureInjection.run_id == run.id))
            await session.execute(delete(Debrief).where(Debrief.run_id == run.id))
            await session.execute(delete(SimulationRun).where(SimulationRun.id == run.id))
        await session.commit()
        print(f"removed {len(targets)} runs")
        return len(targets)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keep-runs", type=int, default=10, choices=range(0, 10_001))
    parser.add_argument("--preserve-mission", type=UUID, default=None)
    parser.add_argument("--before", type=datetime.fromisoformat, default=None, help="ISO-8601 cutoff")
    parser.add_argument("--apply", action="store_true", help="perform deletion; default is dry-run")
    args = parser.parse_args()
    before = args.before
    if before is not None and before.tzinfo is None:
        before = before.replace(tzinfo=timezone.utc)
    asyncio.run(cleanup(args.keep_runs, args.preserve_mission, before, args.apply))


if __name__ == "__main__":
    main()
