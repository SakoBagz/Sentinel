# Sentinel Realtime Architecture

Status: Phase 13 implementation baseline
Date: 2026-08-12

## Role of Redis/Valkey

Redis/Valkey Streams are transient internal event infrastructure. They fan out
telemetry and operational events to logical consumers:

```text
Simulator
   ↓
Redis/Valkey Streams
   ├─ realtime_broadcaster → WebSocket clients
   ├─ persistence_worker   → PostgreSQL batches
   └─ metrics_processor    → counters/latencies
```

Logical stream names:

```text
sentinel:run:{run_id}:telemetry
sentinel:run:{run_id}:events
```

PostgreSQL remains authoritative. If the stream service restarts, current transient
state may disappear, but completed durable mission history must remain available.

## Consumer behavior

The current MVP uses per-run Redis `XREAD` offsets for the WebSocket broadcaster and a
separate bounded persistence worker. Each consumer is restart-safe:

- broadcaster reconnects and cleans up dead WebSocket subscriptions;
- persistence worker batches and retries conflict-safe writes;
- metrics processor records processing lag and failure counts;
- no consumer assumes that stream delivery is exactly once.

Consumer groups can be introduced for multi-instance fan-out without changing these
logical contracts.

## WebSocket endpoint

```text
WS /ws/runs/{run_id}
```

The client first sends:

```json
{
  "type": "subscribe",
  "topics": ["telemetry", "events", "metrics"]
}
```

The server validates the run and topic names, then sends an acknowledgement. Invalid
subscriptions receive a structured error and do not subscribe to arbitrary streams.

## Server messages

Individual messages use the envelope from `EVENT_CONTRACTS.md` with a transport type,
for example:

```json
{
  "type": "vehicle.telemetry",
  "data": {
    "schema_version": 1,
    "event_id": "uuid",
    "run_id": "uuid",
    "vehicle_id": "uuid",
    "sequence": 9812,
    "sim_time_ms": 183400,
    "payload": {}
  }
}
```

At higher scale, a benchmarked batch form is allowed:

```json
{
  "type": "telemetry.batch",
  "messages": []
}
```

Batching is not assumed in the MVP. Candidate windows are 50 ms and 100 ms and must
be measured before adoption.

## Connection lifecycle

The client and server support heartbeat/ping, graceful disconnect, cleanup, bounded
exponential reconnect backoff, and subscription restoration. The web UI exposes
`LIVE`, `RECONNECTING`, and `DISCONNECTED` as text plus non-color indicators.

On reconnect, the client restores topic subscriptions and hydrates current state from
`GET /api/runs/{run_id}/snapshot` before consuming the live stream. Historical gaps
are obtained from REST, not by assuming that a disconnected WebSocket retained all
messages.

## Browser live store

The live telemetry store is conceptually `Map<VehicleId, VehicleTelemetry>`. For each
message it validates the envelope, compares sequence, updates duplicate/missing/
out-of-order counters, updates current vehicle state, and retains only limited
short-term history. It does not accumulate the complete run in browser memory.

## Delivery and ordering

WebSocket delivery is best effort over a reconnectable connection. `sim_time_ms` and
vehicle sequence are the authoritative ordering metadata; arrival order is not. The
server may batch across vehicles but must not mutate sequence numbers.

## Failure and degradation behavior

- Redis connection loss is logged and retried with bounded backoff.
- WebSocket clients remain visibly disconnected while the backend recovers.
- Durable history is served from PostgreSQL after transient recovery.
- A missing transient stream message is not fabricated; the UI indicates gaps where
  sequence accounting detects them.
- AI/provider failures do not affect realtime operations.

## Realtime metrics

Instrument at least generated, received, duplicate, missing, and out-of-order message
counters; active WebSocket connections; end-to-end telemetry latency; event processing
latency; simulation tick duration; stream consumer lag; and database batch-write
duration.

## Remaining realtime hardening

- Choose Redis consumer-group names and pending-entry reclaim policy.
- WebSocket subscriptions are restored on reconnect; changing subscriptions after the
  initial subscribe is deferred until a product surface needs it.
- Set maximum per-message and per-batch sizes before Phase 4.

The reconnect snapshot endpoint and response shape are implemented as
`GET /api/runs/{run_id}/snapshot` and return the latest bounded telemetry state for
each run vehicle.
