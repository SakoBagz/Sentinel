from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.entities import MissionEvent, RunTelemetrySummary, TelemetrySample
from app.services.run_service import get_run


async def run_metrics(session: AsyncSession, run_id: UUID) -> dict:
    run = await get_run(session, run_id)
    telemetry = list((await session.execute(select(TelemetrySample).where(TelemetrySample.run_id == run_id))).scalars().all())
    events = list((await session.execute(select(MissionEvent).where(MissionEvent.run_id == run_id))).scalars().all())
    summary = await session.scalar(
        select(RunTelemetrySummary).where(RunTelemetrySummary.run_id == run_id)
    )

    def enum_value(value: object) -> str:
        return str(getattr(value, "value", value))

    critical = sum(1 for event in events if enum_value(event.severity) == "CRITICAL")
    warning = sum(1 for event in events if enum_value(event.severity) == "WARNING")
    completed = sum(
        1
        for vehicle in run.run_vehicles
        if any(
            event.vehicle_id == vehicle.id and enum_value(event.event_type) == "vehicle.completed"
            for event in events
        )
    )
    if summary is not None:
        generated = summary.generated_messages
        delivered = summary.delivered_messages
        unique_delivered = summary.unique_delivered_messages
        persisted = summary.persisted_messages
        missing = summary.missing_messages
        duplicates = summary.duplicate_messages
        out_of_order = summary.out_of_order_messages
        healthy_delivered = summary.healthy_delivered_messages
        duration = summary.simulated_mission_duration_ms
        latency = {
            "p50": summary.modeled_latency_p50_ms,
            "p95": summary.modeled_latency_p95_ms,
            "p99": summary.modeled_latency_p99_ms,
        }
    else:
        # Older runs predate the runtime summary. Their persisted telemetry cannot
        # reveal dropped originals, duplicates, or modeled network latency, so do
        # not mistake downsampling gaps for packet loss.
        generated = delivered = unique_delivered = persisted = len(telemetry)
        missing = duplicates = out_of_order = 0
        healthy_delivered = sum(
            1 for sample in telemetry if enum_value(sample.communications_state) == "HEALTHY"
        )
        duration = max([sample.sim_time_ms for sample in telemetry] + [event.sim_time_ms for event in events] + [0])
        latency = {"p50": 0.0, "p95": 0.0, "p99": 0.0}
    throughput = delivered / max(duration / 1000, 1)
    availability = (healthy_delivered / unique_delivered * 100.0) if unique_delivered else 0.0
    return {
        "run_id": run_id,
        "telemetry_messages_received": delivered,
        "telemetry_messages_generated": generated,
        "telemetry_messages_delivered": delivered,
        "telemetry_messages_unique_delivered": unique_delivered,
        "telemetry_messages_persisted": persisted,
        "telemetry_sequences_missing": missing,
        "telemetry_sequences_duplicate": duplicates,
        "telemetry_sequences_out_of_order": out_of_order,
        "telemetry_loss_percent": (missing / generated * 100.0) if generated else 0.0,
        "telemetry_healthy_delivered": healthy_delivered,
        "event_count": len(events),
        "warning_count": warning,
        "critical_count": critical,
        "vehicle_count": len(run.run_vehicles),
        "completed_vehicle_count": completed,
        "mission_duration_ms": duration,
        "simulated_mission_duration_ms": duration,
        "communications_availability_percent": availability,
        "telemetry_throughput_per_second": throughput,
        "latency_p50_ms": latency["p50"],
        "latency_p95_ms": latency["p95"],
        "latency_p99_ms": latency["p99"],
        "persistence_queue_high_water_mark": (
            summary.persistence_queue_high_water_mark if summary is not None else 0
        ),
    }
