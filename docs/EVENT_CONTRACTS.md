# Sentinel Event and Telemetry Contracts

Status: Phase 13 implementation baseline
Date: 2026-08-12

## Contract rules

- Every external event has a schema version.
- Every telemetry message has an event ID and a per-vehicle monotonic sequence.
- Boundary payloads are validated with Pydantic on ingress/egress and Zod in the web
  client.
- Event names are centralized; producers must not invent ad hoc names.
- Duplicate delivery is expected and safe.
- Durable processing is idempotent.

## Common envelope

All telemetry and mission events use the following conceptual envelope:

```json
{
  "schema_version": 1,
  "event_id": "uuid",
  "mission_id": "uuid",
  "run_id": "uuid",
  "vehicle_id": "uuid or null",
  "sequence": 9812,
  "sim_time_ms": 183400,
  "emitted_at": "2026-08-12T01:22:10Z",
  "type": "vehicle.telemetry",
  "severity": "INFO",
  "payload": {}
}
```

`sequence` is required for telemetry and may be null for non-telemetry events. The
canonical timestamp for ordering within a run is `sim_time_ms`; `emitted_at` records
wall-clock emission in UTC for diagnostics.

## Telemetry payload

`type` is `vehicle.telemetry`. The payload contains:

```json
{
  "latitude": 34.1521,
  "longitude": -118.2413,
  "altitude_m": 121.7,
  "heading_deg": 218.5,
  "ground_speed_mps": 18.1,
  "battery_percent": 73.2,
  "mission_state": "EXECUTING",
  "communications_state": "HEALTHY"
}
```

The simulator may add bounded diagnostic fields without changing the base schema,
including `gps_quality_percent` for GPS degradation and `sensor_status` for an
unavailable sensor. These values describe simulated instrument health; they do not
rewrite the vehicle's internal navigation state.

The durable representation may be downsampled, but it must preserve the sequence and
event identity of each persisted sample. High-frequency transient messages may be
delivered without being durably retained.

## Event taxonomy

### Mission

`mission.created`, `mission.updated`, `mission.started`, `mission.paused`,
`mission.resumed`, `mission.completed`, `mission.aborted`.

### Vehicle

`vehicle.ready`, `vehicle.launched`, `vehicle.waypoint_reached`,
`vehicle.returning`, `vehicle.landed`, `vehicle.completed`, `vehicle.telemetry`.

### Communications

`communications.degraded`, `communications.stale`, `communications.lost`,
`communications.recovering`, `communications.restored`.

### Battery

`battery.low`, `battery.critical`.

### Failure injection

`failure.injected`, `failure.cleared`.

### System

`system.warning`, `system.error`.

## Severity mapping

| Event | Default severity |
|---|---|
| `vehicle.waypoint_reached` | INFO |
| `communications.degraded` | WARNING |
| `communications.lost` | CRITICAL |
| `battery.critical` | CRITICAL |
| normal lifecycle and recovery events | INFO |
| `system.warning` | WARNING |
| `system.error` | CRITICAL unless explicitly downgraded |

Severity remains an enum: `INFO`, `WARNING`, or `CRITICAL`.

## Sequence semantics

Each run vehicle starts at sequence zero and increments monotonically for generated
telemetry. Consumers compare the incoming sequence to the highest accepted sequence:

- equal sequence: duplicate; increment duplicate statistic and do not create a second
  durable sample;
- greater by more than one: record missing sequence count and accept the new sample;
- lower than the highest: record out-of-order delivery; accept or ignore according to
  the consumer's stream policy, but never violate durable idempotency;
- equal event identity with duplicate delivery: same generated message, safe retry.

The initial live store may retain the latest state and counters only; it must not keep
the full mission telemetry history in browser memory.

## Idempotency

The required durable key is `(run_id, vehicle_id, sequence)`. Database conflicts on
that key are successful no-op retries when the payload is equivalent. A conflicting
payload for the same key is a contract violation and must be logged and surfaced as a
data-integrity error; it must not silently overwrite history.

Mission event IDs are UUID primary keys. Event consumers must also be safe to retry.

## Validation rules

- UUID fields must parse as UUIDs.
- `schema_version` must be supported before dispatch.
- `run_id` and `mission_id` must refer to the expected aggregate.
- Telemetry coordinates and numeric ranges must be valid.
- Mission and communications state values must be known enums.
- `sim_time_ms` is non-negative and non-decreasing for a given generated run clock.
- `emitted_at` is UTC and is not used as the simulation ordering key.

Invalid external messages are rejected, logged with a request/event identifier, and
not partially persisted.

## Redis Stream records

Logical stream names are:

```text
sentinel:run:{run_id}:telemetry
sentinel:run:{run_id}:events
```

Stream entries carry the serialized versioned envelope plus minimal routing metadata.
Redis is transport, not authority; PostgreSQL retains the durable history.

## Contract evolution

Adding optional payload fields is backward-compatible when consumers ignore unknown
fields. Removing or changing meaning requires a new `schema_version` and a migration
plan. Consumers must reject unsupported major versions explicitly rather than guessing.

## Open contract points

- Confirm whether all event envelopes include a nullable `sequence` or telemetry has a
  specialized envelope type.
- Confirm whether out-of-order telemetry is broadcast live, persisted, both, or only
  counted.
- Confirm whether event UUIDs are generated by the simulator or the event service.
