from collections import defaultdict
from datetime import timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.entities import MissionEvent, TelemetrySample
from app.services.run_service import get_run


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    values = sorted(values)
    position = (len(values) - 1) * percentile
    lower, upper = int(position), min(len(values) - 1, int(position) + 1)
    return values[lower] + (values[upper] - values[lower]) * (position - lower)


async def run_metrics(session: AsyncSession, run_id: UUID) -> dict:
    run = await get_run(session, run_id)
    telemetry = list((await session.execute(select(TelemetrySample).where(TelemetrySample.run_id == run_id))).scalars().all())
    events = list((await session.execute(select(MissionEvent).where(MissionEvent.run_id == run_id))).scalars().all())
    by_vehicle: dict[UUID, list[int]] = defaultdict(list)
    for sample in telemetry:
        by_vehicle[sample.vehicle_id].append(sample.sequence)
    missing = sum(max(0, max(sequences) - min(sequences) + 1 - len(set(sequences))) for sequences in by_vehicle.values() if sequences)
    duplicates = sum(len(sequences) - len(set(sequences)) for sequences in by_vehicle.values())
    out_of_order = sum(1 for sequences in by_vehicle.values() if any(right < left for left, right in zip(sequences, sequences[1:])))
    base_time = run.started_at or run.created_at
    if base_time.tzinfo is None:
        base_time = base_time.replace(tzinfo=timezone.utc)
    latency_values = [
        float(
            (
                (sample.received_at.replace(tzinfo=timezone.utc) if sample.received_at.tzinfo is None else sample.received_at)
                - (base_time + timedelta(milliseconds=sample.sim_time_ms))
            ).total_seconds()
            * 1000
        )
        for sample in telemetry
    ]
    critical = sum(1 for event in events if str(event.severity) == "CRITICAL")
    warning = sum(1 for event in events if str(event.severity) == "WARNING")
    duration = max(
        [sample.sim_time_ms for sample in telemetry]
        + [event.sim_time_ms for event in events]
        + [0]
    )
    throughput = len(telemetry) / max(duration / 1000, 1)
    completed = sum(1 for vehicle in run.run_vehicles if any(event.vehicle_id == vehicle.id and str(event.event_type) == "vehicle.completed" for event in events))
    healthy_samples = sum(1 for sample in telemetry if str(sample.communications_state) == "HEALTHY")
    availability = (healthy_samples / len(telemetry) * 100.0) if telemetry else 0.0
    return {
        "run_id": run_id,
        "telemetry_messages_received": len(telemetry),
        "telemetry_sequences_missing": missing,
        "telemetry_sequences_duplicate": duplicates,
        "telemetry_sequences_out_of_order": out_of_order,
        "event_count": len(events),
        "warning_count": warning,
        "critical_count": critical,
        "vehicle_count": len(run.run_vehicles),
        "completed_vehicle_count": completed,
        "mission_duration_ms": duration,
        "communications_availability_percent": availability,
        "telemetry_throughput_per_second": throughput,
        "latency_p50_ms": _percentile(latency_values, 0.50),
        "latency_p95_ms": _percentile(latency_values, 0.95),
        "latency_p99_ms": _percentile(latency_values, 0.99),
    }
