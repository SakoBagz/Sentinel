#!/usr/bin/env python3
"""Measure the local coordinator, Redis Streams, persistence worker, and PostgreSQL path.

This is intentionally separate from ``scripts/benchmark.py``. It requires the local
PostgreSQL and Redis services to be running with the current Alembic schema and
reports only measurements collected from the requested run.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import platform
import resource
import sys
import time
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
for import_root in (ROOT / "apps" / "api", ROOT / "simulator"):
    if str(import_root) not in sys.path:
        sys.path.insert(0, str(import_root))

from app.db.models.entities import (  # noqa: E402
    Mission,
    MissionVehicle,
    RunTelemetrySummary,
    RunVehicle,
    SimulationRun,
    VehicleDefinition,
    Waypoint,
)
from app.db.session import SessionFactory, dispose_engine  # noqa: E402
from app.domain.enums import MissionStatus, RunStatus, WaypointAction  # noqa: E402
from app.realtime.redis import close_redis  # noqa: E402
from app.realtime.runner import coordinator  # noqa: E402


def _memory_peak_bytes() -> int:
    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(usage if sys.platform == "darwin" else usage * 1024)


def environment_snapshot() -> dict[str, Any]:
    return {
        "machine": platform.machine(),
        "processor": platform.processor(),
        "os": platform.platform(),
        "python": platform.python_version(),
        "cpu_count": os.cpu_count(),
    }


async def create_benchmark_run(
    *,
    vehicle_count: int,
    duration_seconds: float,
    telemetry_rate_hz: float,
    persistence_rate_hz: float,
    simulation_tick_hz: float,
    queue_maxsize: int,
    seed: int,
) -> UUID:
    if vehicle_count <= 0:
        raise ValueError("vehicle_count must be positive")
    if duration_seconds <= 0:
        raise ValueError("duration_seconds must be positive")
    if telemetry_rate_hz <= 0 or telemetry_rate_hz > simulation_tick_hz:
        raise ValueError("telemetry_rate_hz must be positive and no greater than simulation_tick_hz")
    if persistence_rate_hz <= 0 or simulation_tick_hz <= 0 or queue_maxsize <= 0:
        raise ValueError("rates and queue_maxsize must be positive")

    run_id = uuid4()
    mission_id = uuid4()
    mission = Mission(
        id=mission_id,
        name=f"Integrated benchmark {run_id.hex[:8]}",
        description="Local end-to-end benchmark workload",
        scenario_type="MAPPING",
        status=MissionStatus.READY,
    )
    run = SimulationRun(
        id=run_id,
        mission_id=mission_id,
        status=RunStatus.RUNNING,
        random_seed=seed,
        simulation_speed=1_000.0,
        configuration={
            "duration_limit_ms": round(duration_seconds * 1000),
            "simulation_tick_hz": simulation_tick_hz,
            "telemetry_persist_rate_hz": persistence_rate_hz,
            "persistence_queue_maxsize": queue_maxsize,
            "benchmark": True,
        },
    )
    mission_vehicles: list[MissionVehicle] = []
    run_vehicles: list[RunVehicle] = []
    definitions: list[VehicleDefinition] = []
    waypoints: list[Waypoint] = []
    for index in range(vehicle_count):
        vehicle_definition_id = uuid4()
        mission_vehicle_id = uuid4()
        callsign = f"BENCH-{run_id.hex[:8]}-{index:04d}"
        definition = VehicleDefinition(
            id=vehicle_definition_id,
            callsign=callsign,
            vehicle_type="SURVEY",
            max_speed_mps=25.0,
            cruise_speed_mps=18.0,
            battery_capacity=100.0,
            telemetry_rate_hz=telemetry_rate_hz,
            configuration={},
        )
        mission_vehicle = MissionVehicle(
            id=mission_vehicle_id,
            mission_id=mission_id,
            vehicle_definition_id=vehicle_definition_id,
            starting_latitude=34.10 + (index % 100) * 0.0001,
            starting_longitude=-118.30 + (index // 100) * 0.0001,
            starting_altitude_m=100.0,
            configuration={},
        )
        run_vehicle = RunVehicle(
            id=uuid4(),
            run_id=run_id,
            vehicle_definition_id=vehicle_definition_id,
            starting_latitude=mission_vehicle.starting_latitude,
            starting_longitude=mission_vehicle.starting_longitude,
            starting_altitude_m=100.0,
            configuration={},
        )
        waypoint = Waypoint(
            id=uuid4(),
            mission_id=mission_id,
            vehicle_id=mission_vehicle_id,
            sequence=0,
            latitude=float(mission_vehicle.starting_latitude) + 0.01,
            longitude=float(mission_vehicle.starting_longitude),
            altitude_m=100.0,
            target_speed_mps=18.0,
            arrival_radius_m=5.0,
            action=WaypointAction.SURVEY,
        )
        definitions.append(definition)
        mission_vehicles.append(mission_vehicle)
        run_vehicles.append(run_vehicle)
        waypoints.append(waypoint)

    async with SessionFactory() as session:
        session.add(mission)
        session.add(run)
        session.add_all(definitions + mission_vehicles + run_vehicles + waypoints)
        await session.commit()
    return run_id


async def run_integrated_benchmark(
    *,
    vehicle_count: int,
    duration_seconds: float,
    telemetry_rate_hz: float,
    persistence_rate_hz: float,
    simulation_tick_hz: float,
    queue_maxsize: int,
    seed: int,
) -> dict[str, Any]:
    run_id = await create_benchmark_run(
        vehicle_count=vehicle_count,
        duration_seconds=duration_seconds,
        telemetry_rate_hz=telemetry_rate_hz,
        persistence_rate_hz=persistence_rate_hz,
        simulation_tick_hz=simulation_tick_hz,
        queue_maxsize=queue_maxsize,
        seed=seed,
    )
    started = time.perf_counter()
    await coordinator.start(run_id)
    await coordinator.wait(run_id)
    wall_seconds = max(time.perf_counter() - started, 1e-9)
    async with SessionFactory() as session:
        run = await session.scalar(select(SimulationRun).where(SimulationRun.id == run_id))
        summary = await session.scalar(
            select(RunTelemetrySummary).where(RunTelemetrySummary.run_id == run_id)
        )
    if run is None or summary is None:
        raise RuntimeError(f"integrated benchmark did not produce a durable summary for {run_id}")
    diagnostics = coordinator.last_run_diagnostics or {}
    simulated_seconds = max(summary.simulated_mission_duration_ms / 1000, 1e-9)
    return {
        "run_id": str(run_id),
        "environment": environment_snapshot(),
        "configuration": {
            "vehicles": vehicle_count,
            "duration_seconds": duration_seconds,
            "telemetry_rate_hz": telemetry_rate_hz,
            "persistence_rate_hz": persistence_rate_hz,
            "simulation_tick_hz": simulation_tick_hz,
            "persistence_queue_maxsize": queue_maxsize,
            "seed": seed,
            "measurement": "SimulationEngine -> NetworkSimulator -> Redis Streams -> PersistenceWorker -> PostgreSQL",
        },
        "status": run.status.value,
        "terminal_reason": "duration_limit" if run.status is RunStatus.ABORTED else "completed",
        "messages": {
            "generated": summary.generated_messages,
            "delivered": summary.delivered_messages,
            "unique_delivered": summary.unique_delivered_messages,
            "persisted": summary.persisted_messages,
            "missing": summary.missing_messages,
            "duplicates": summary.duplicate_messages,
            "out_of_order": summary.out_of_order_messages,
            "healthy_delivered": summary.healthy_delivered_messages,
        },
        "performance": {
            "wall_seconds": wall_seconds,
            "simulated_mission_duration_ms": summary.simulated_mission_duration_ms,
            "generated_throughput_per_wall_second": summary.generated_messages / wall_seconds,
            "delivered_throughput_per_wall_second": summary.delivered_messages / wall_seconds,
            "persisted_throughput_per_wall_second": summary.persisted_messages / wall_seconds,
            "generated_throughput_per_simulated_second": summary.generated_messages / simulated_seconds,
            "tick_latency_ms": diagnostics.get("tick_latency_ms", {"p50": 0.0, "p95": 0.0, "p99": 0.0}),
            "modeled_network_latency_ms": {
                "p50": summary.modeled_latency_p50_ms,
                "p95": summary.modeled_latency_p95_ms,
                "p99": summary.modeled_latency_p99_ms,
            },
            "redis_publish_duration_ms": diagnostics.get(
                "redis_publish_duration_ms", {"p50": 0.0, "p95": 0.0, "p99": 0.0}
            ),
            "database_batch_duration_ms": diagnostics.get(
                "database_batch_duration_ms", {"p50": 0.0, "p95": 0.0, "p99": 0.0}
            ),
            "persistence_queue_high_water_mark": summary.persistence_queue_high_water_mark,
            "errors": diagnostics.get("errors", 0),
            "peak_memory_bytes": _memory_peak_bytes(),
        },
    }


async def _main(args: argparse.Namespace) -> None:
    try:
        result = await run_integrated_benchmark(
            vehicle_count=args.vehicles,
            duration_seconds=args.duration,
            telemetry_rate_hz=args.rate,
            persistence_rate_hz=args.persist_rate,
            simulation_tick_hz=args.tick_hz,
            queue_maxsize=args.queue_maxsize,
            seed=args.seed,
        )
        rendered = json.dumps(result, indent=2, sort_keys=True)
        print(rendered)
        if args.output is not None:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(rendered + "\n", encoding="utf-8")
    finally:
        await coordinator.stop_all()
        await close_redis()
        await dispose_engine()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vehicles", type=int, default=2)
    parser.add_argument("--duration", type=float, default=5.0)
    parser.add_argument("--rate", type=float, default=10.0)
    parser.add_argument("--persist-rate", type=float, default=2.0)
    parser.add_argument("--tick-hz", type=float, default=10.0)
    parser.add_argument("--queue-maxsize", type=int, default=1_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    asyncio.run(_main(args))


if __name__ == "__main__":
    main()
