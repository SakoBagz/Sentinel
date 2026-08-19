import asyncio
from uuid import uuid4

import pytest

from app.realtime import hub as hub_module
from app.realtime.hub import ClientSession, RealtimeHub


def test_slow_client_queue_discards_oldest_and_keeps_newest() -> None:
    session = ClientSession(run_id=uuid4())
    session.queue = asyncio.Queue(maxsize=1)
    first = {"type": "vehicle.telemetry", "data": {"sequence": 1}}
    newest = {"type": "vehicle.telemetry", "data": {"sequence": 2}}
    session.enqueue(first)
    session.enqueue(newest)

    assert session.queue.qsize() == 1
    assert session.queue.get_nowait() == newest


@pytest.mark.asyncio
async def test_new_stream_consumer_starts_at_live_position(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, str]] = []
    finished = asyncio.Event()

    class FakeRedis:
        async def xread(self, streams, *, count, block):
            calls.append(streams)
            finished.set()
            await asyncio.Event().wait()

    monkeypatch.setattr(hub_module, "redis_client", FakeRedis())
    hub = RealtimeHub()
    run_id = uuid4()
    session = hub.connect(run_id)
    await finished.wait()
    task = hub._stream_tasks[run_id]
    assert calls[0][next(key for key in calls[0] if key.endswith(":telemetry"))] == "$"
    assert calls[0][next(key for key in calls[0] if key.endswith(":events"))] == "$"
    task.cancel()
    await hub.disconnect(session)
