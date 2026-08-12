import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from redis.asyncio import Redis

from sentinel_sim.models import SimulationEvent, TelemetryEnvelope

TELEMETRY_TOPIC = "telemetry"
EVENTS_TOPIC = "events"
METRICS_TOPIC = "metrics"
TOPICS = frozenset({TELEMETRY_TOPIC, EVENTS_TOPIC, METRICS_TOPIC})


def telemetry_stream_name(run_id: UUID) -> str:
    return f"sentinel:run:{run_id}:telemetry"


def events_stream_name(run_id: UUID) -> str:
    return f"sentinel:run:{run_id}:events"


@dataclass(frozen=True)
class StreamRecord:
    stream: str
    record_id: str
    data: dict[str, Any]


def _serialized(envelope: TelemetryEnvelope | SimulationEvent) -> dict[str, str]:
    return {"data": json.dumps(envelope.to_dict(), separators=(",", ":"))}


async def publish_telemetry(redis: Redis, envelope: TelemetryEnvelope) -> str | None:
    try:
        return await redis.xadd(telemetry_stream_name(envelope.run_id), _serialized(envelope), maxlen=100_000, approximate=True)
    except Exception:
        # Redis is transient infrastructure; simulation continues and the failure is
        # surfaced by health/structured logging in the application layer.
        return None


async def publish_event(redis: Redis, event: SimulationEvent) -> str | None:
    try:
        return await redis.xadd(events_stream_name(event.run_id), _serialized(event), maxlen=25_000, approximate=True)
    except Exception:
        return None


def decode_records(stream: str, records: list[tuple[str, Mapping[str, str]]]) -> list[StreamRecord]:
    decoded: list[StreamRecord] = []
    for record_id, fields in records:
        raw = fields.get("data")
        if raw is None:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            decoded.append(StreamRecord(stream=stream, record_id=record_id, data=data))
    return decoded

