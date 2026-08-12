import asyncio
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from uuid import UUID


from app.observability.metrics import metrics
from app.realtime.redis import redis_client
from app.realtime.streams import (
    EVENTS_TOPIC,
    METRICS_TOPIC,
    TELEMETRY_TOPIC,
    TOPICS,
    decode_records,
    events_stream_name,
    telemetry_stream_name,
)

logger = logging.getLogger(__name__)


@dataclass(eq=False)
class ClientSession:
    run_id: UUID
    queue: asyncio.Queue[dict] = field(default_factory=lambda: asyncio.Queue(maxsize=500))
    topics: set[str] = field(default_factory=lambda: {TELEMETRY_TOPIC, EVENTS_TOPIC, METRICS_TOPIC})
    closed: bool = False

    def enqueue(self, message: dict) -> None:
        if self.closed:
            return
        try:
            self.queue.put_nowait(message)
        except asyncio.QueueFull:
            # A slow browser must not block the simulation or all other clients.
            try:
                self.queue.get_nowait()
                self.queue.put_nowait({"type": "system.warning", "data": {"code": "CLIENT_QUEUE_DROPPED"}})
            except asyncio.QueueEmpty:
                pass


class RealtimeHub:
    def __init__(self) -> None:
        self._clients: dict[UUID, set[ClientSession]] = defaultdict(set)
        self._stream_tasks: dict[UUID, asyncio.Task[None]] = {}

    def connect(self, run_id: UUID) -> ClientSession:
        session = ClientSession(run_id=run_id)
        self._clients[run_id].add(session)
        metrics.set_gauge("websocket_connections_active", sum(len(items) for items in self._clients.values()))
        if run_id not in self._stream_tasks:
            self._stream_tasks[run_id] = asyncio.create_task(self._consume_run(run_id))
        return session

    async def disconnect(self, session: ClientSession) -> None:
        session.closed = True
        clients = self._clients.get(session.run_id)
        if clients is not None:
            clients.discard(session)
            if not clients:
                self._clients.pop(session.run_id, None)
        if session.run_id not in self._clients:
            task = self._stream_tasks.pop(session.run_id, None)
            if task is not None:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        metrics.set_gauge("websocket_connections_active", sum(len(items) for items in self._clients.values()))

    def subscribe(self, session: ClientSession, topics: list[str]) -> None:
        invalid = set(topics) - TOPICS
        if invalid or not topics:
            raise ValueError(f"Unsupported topics: {sorted(invalid)}")
        session.topics = set(topics)

    def broadcast(self, run_id: UUID, topic: str, message: dict) -> None:
        transport_type = message.get("type", "system.warning")
        for session in list(self._clients.get(run_id, ())):
            if topic in session.topics:
                session.enqueue({"type": transport_type, "data": message})

    async def _consume_run(self, run_id: UUID) -> None:
        telemetry_id = "0-0"
        events_id = "0-0"
        try:
            while self._clients.get(run_id):
                try:
                    records = await redis_client.xread(
                        {
                            telemetry_stream_name(run_id): telemetry_id,
                            events_stream_name(run_id): events_id,
                        },
                        count=100,
                        block=1000,
                    )
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    logger.warning("realtime stream read failed", extra={"run_id": str(run_id), "error": str(exc)})
                    await asyncio.sleep(0.5)
                    continue
                for stream, raw_records in records:
                    decoded = decode_records(stream, raw_records)
                    for record in decoded:
                        if stream == telemetry_stream_name(run_id):
                            telemetry_id = record.record_id
                            self.broadcast(run_id, TELEMETRY_TOPIC, {"type": "vehicle.telemetry", **record.data})
                        elif stream == events_stream_name(run_id):
                            events_id = record.record_id
                            self.broadcast(run_id, EVENTS_TOPIC, {"type": record.data.get("type", "system.warning"), **record.data})
                    await self._record_stream_lag(stream, telemetry_id if stream == telemetry_stream_name(run_id) else events_id)
        finally:
            self._stream_tasks.pop(run_id, None)

    async def _record_stream_lag(self, stream: str, consumed_id: str) -> None:
        try:
            info = await redis_client.xinfo_stream(stream)
            last_id = info.get("last-generated-id")
            if not last_id:
                return
            latest_ms = int(str(last_id).split("-", 1)[0])
            consumed_ms = int(str(consumed_id).split("-", 1)[0])
            metrics.set_gauge("stream_consumer_lag", max(0, latest_ms - consumed_ms))
        except Exception:
            # Stream diagnostics must never interrupt delivery.
            return

    async def close(self) -> None:
        tasks = list(self._stream_tasks.values())
        self._stream_tasks.clear()
        for task in tasks:
            task.cancel()
        for task in tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
        for clients in self._clients.values():
            for session in clients:
                session.closed = True
        self._clients.clear()
        metrics.set_gauge("websocket_connections_active", 0)


hub = RealtimeHub()
