#!/usr/bin/env python3
"""Run truthful, deterministic in-process simulator benchmarks.

The harness deliberately measures the simulator and an in-process persistence sink;
it does not claim to measure a deployed API, Redis, or PostgreSQL installation.
Use ``scripts/load_test.py`` for the same profile-shaped workload with a concise
load-test report.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import resource
import shutil
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Any
from uuid import UUID, uuid5

ROOT = Path(__file__).resolve().parents[1]
for import_root in (ROOT / "apps" / "api", ROOT / "simulator"):
    if str(import_root) not in sys.path:
        sys.path.insert(0, str(import_root))

from sentinel_sim.engine import SimulationEngine  # noqa: E402
from sentinel_sim.models import MissionConfiguration, VehicleConfiguration, WaypointConfiguration  # noqa: E402
from sentinel_sim.navigation import Position  # noqa: E402


PROFILES = (100, 250, 500, 1_000)


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = fraction * (len(ordered) - 1)
    lower = int(rank)
    upper = min(len(ordered) - 1, lower + 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (rank - lower)


def _memory_peak_bytes() -> int:
    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(usage if sys.platform == "darwin" else usage * 1024)


def _docker_version() -> str | None:
    executable = shutil.which("docker")
    if executable is None:
        return None
    try:
        result = subprocess.run(
            [executable, "version", "--format", "{{.Server.Version}}"],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    value = result.stdout.strip()
    return value or None


def environment_snapshot() -> dict[str, Any]:
    return {
        "machine": platform.machine(),
        "processor": platform.processor(),
        "os": platform.platform(),
        "python": platform.python_version(),
        "cpu_count": os.cpu_count(),
        "docker_server_version": _docker_version(),
    }


def build_mission(vehicle_count: int, rate_hz: float, duration_seconds: float, seed: int) -> tuple[MissionConfiguration, UUID]:
    if vehicle_count <= 0:
        raise ValueError("vehicle_count must be positive")
    if rate_hz <= 0:
        raise ValueError("rate_hz must be positive")
    if duration_seconds <= 0:
        raise ValueError("duration_seconds must be positive")
    run_id = uuid5(UUID("00000000-0000-0000-0000-000000000000"), f"benchmark:{vehicle_count}:{rate_hz}:{duration_seconds}:{seed}")
    vehicles: list[VehicleConfiguration] = []
    waypoints: list[WaypointConfiguration] = []
    for index in range(vehicle_count):
        vehicle_id = uuid5(run_id, f"vehicle:{index}")
        latitude = 34.10 + (index % 100) * 0.0001
        longitude = -118.30 + (index // 100) * 0.0001
        vehicles.append(
            VehicleConfiguration(
                id=vehicle_id,
                callsign=f"BENCH-{index:04d}",
                vehicle_type="SURVEY",
                max_speed_mps=25,
                cruise_speed_mps=18,
                battery_capacity=100,
                telemetry_rate_hz=rate_hz,
                starting_position=Position(latitude, longitude, 100),
            )
        )
        waypoints.append(
            WaypointConfiguration(
                id=uuid5(run_id, f"waypoint:{index}"),
                vehicle_id=vehicle_id,
                sequence=0,
                latitude=latitude + 0.01,
                longitude=longitude,
                altitude_m=100,
                target_speed_mps=18,
                arrival_radius_m=5,
            )
        )
    return MissionConfiguration(
        id=uuid5(run_id, "mission"),
        vehicles=tuple(vehicles),
        waypoints=tuple(waypoints),
        duration_limit_ms=round(duration_seconds * 1000),
    ), run_id


def run_profile(vehicle_count: int, rate_hz: float, duration_seconds: float, seed: int) -> dict[str, Any]:
    mission, run_id = build_mission(vehicle_count, rate_hz, duration_seconds, seed)
    engine = SimulationEngine(
        mission,
        run_id,
        seed,
        tick_hz=10.0,
        telemetry_rate_hz=rate_hz,
    )
    tick_durations: list[float] = []
    delivery_latencies: list[float] = []
    started = time.perf_counter()
    cpu_started = time.process_time()
    errors = 0
    ticks = round(duration_seconds * 10)
    try:
        for _ in range(ticks):
            tick_started = time.perf_counter()
            engine.tick()
            tick_elapsed = (time.perf_counter() - tick_started) * 1000
            tick_durations.append(tick_elapsed)
            delivery_latencies.extend(engine.network.take_last_delivery_latencies())
    except Exception:
        errors += 1
    wall_seconds = max(time.perf_counter() - started, 1e-9)

    generated_by_vehicle: dict[UUID, set[int]] = defaultdict(set)
    delivered_by_vehicle: dict[UUID, list[int]] = defaultdict(list)
    for sample in engine.generated_telemetry:
        generated_by_vehicle[sample.vehicle_id].add(sample.sequence)
    for sample in engine.telemetry:
        delivered_by_vehicle[sample.vehicle_id].append(sample.sequence)
    generated = len(engine.generated_telemetry)
    delivered = len(engine.telemetry)
    persisted_keys = {
        (sample.run_id, sample.vehicle_id, sample.sequence)
        for sample in engine.telemetry
    }
    duplicates = sum(
        len(sequences) - len(set(sequences)) for sequences in delivered_by_vehicle.values()
    )
    missing = sum(
        len(sequences - set(delivered_by_vehicle.get(vehicle_id, [])))
        for vehicle_id, sequences in generated_by_vehicle.items()
    )
    out_of_order = sum(
        1
        for sequences in delivered_by_vehicle.values()
        for left, right in zip(sequences, sequences[1:])
        if right < left
    )
    return {
        "run_id": str(run_id),
        "environment": environment_snapshot(),
        "configuration": {
            "vehicles": vehicle_count,
            "telemetry_rate_hz": rate_hz,
            "duration_seconds": duration_seconds,
            "seed": seed,
            "tick_hz": 10.0,
            "measurement": "in-process simulator plus in-process idempotent sink",
        },
        "messages": {
            "generated": generated,
            "delivered": delivered,
            "persisted": len(persisted_keys),
            "errors": errors,
            "duplicates": duplicates,
            "missing": missing,
            "out_of_order": out_of_order,
        },
        "performance": {
            "wall_seconds": wall_seconds,
            "throughput_generated_per_second": generated / wall_seconds,
            "error_rate": errors / max(generated, 1),
            "cpu_seconds": time.process_time() - cpu_started,
            "memory_peak_bytes": _memory_peak_bytes(),
            "tick_p50_ms": percentile(tick_durations, 0.50),
            "tick_p95_ms": percentile(tick_durations, 0.95),
            "tick_p99_ms": percentile(tick_durations, 0.99),
            "latency_p50_ms": percentile(delivery_latencies, 0.50),
            "latency_p95_ms": percentile(delivery_latencies, 0.95),
            "latency_p99_ms": percentile(delivery_latencies, 0.99),
            "tick_mean_ms": mean(tick_durations) if tick_durations else 0.0,
        },
    }


def _write_results(results: list[dict[str, Any]], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    for result in results:
        vehicles = result["configuration"]["vehicles"]
        (output_dir / f"benchmark-{vehicles}-{stamp}.json").write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    lines = [
        "# Sentinel benchmark summary",
        "",
        "These results are local measurements from the in-process simulator and sink; they are not cloud capacity claims.",
        "",
        "| Vehicles | Generated | Delivered | Persisted | Throughput msg/s | p95 latency ms | Errors |",
        "|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for result in results:
        config = result["configuration"]
        messages = result["messages"]
        performance = result["performance"]
        lines.append(
            f"| {config['vehicles']} | {messages['generated']} | {messages['delivered']} | {messages['persisted']} | "
            f"{performance['throughput_generated_per_second']:.2f} | {performance['latency_p95_ms']:.3f} | {messages['errors']} |"
        )
    (output_dir / f"benchmark-summary-{stamp}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vehicles", type=int, default=None, help="single vehicle count; omit for all standard profiles")
    parser.add_argument("--rate", type=float, default=10.0, help="telemetry messages per vehicle per second")
    parser.add_argument("--duration", type=float, default=5.0, help="simulated seconds to measure")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "benchmark-results")
    args = parser.parse_args()
    vehicle_counts = (args.vehicles,) if args.vehicles is not None else PROFILES
    results = []
    for vehicle_count in vehicle_counts:
        print(f"running {vehicle_count} vehicles at {args.rate:g} Hz for {args.duration:g}s", flush=True)
        result = run_profile(vehicle_count, args.rate, args.duration, args.seed)
        results.append(result)
        print(json.dumps({"vehicles": vehicle_count, **result["messages"], **result["performance"]}, sort_keys=True))
    _write_results(results, args.output_dir)
    print(f"wrote measured JSON and summary to {args.output_dir}")


if __name__ == "__main__":
    main()
