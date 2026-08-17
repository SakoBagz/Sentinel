# Sentinel Database Design

Status: Phase 14 implementation baseline
Date: 2026-08-12

## Persistence policy

PostgreSQL is the durable system of record. Redis/Valkey is transient and may lose
in-flight stream state on restart. The simulator does not synchronously write every
tick to PostgreSQL. A persistence worker validates, batches, retries, and idempotently
writes telemetry; important mission events are persisted at full fidelity.

Default rates: simulation tick 10 Hz locally; live telemetry 10 Hz locally and 5 Hz
in public demo mode; durable telemetry 2 Hz configurable; important events 100%.

## Relational model

The following is the minimum schema from the master specification plus the contract
additions required by the implemented API and realtime flows.

### `missions`

| Column | Type / constraint |
|---|---|
| `id` | UUID primary key |
| `name` | VARCHAR, required |
| `description` | TEXT |
| `scenario_type` | VARCHAR |
| `status` | controlled status enum, required |
| `created_at`, `updated_at` | TIMESTAMPTZ, required |

### `vehicle_definitions`

| Column | Type / constraint |
|---|---|
| `id` | UUID primary key |
| `callsign`, `vehicle_type` | VARCHAR, required |
| `max_speed_mps`, `cruise_speed_mps` | DOUBLE PRECISION, required |
| `battery_capacity`, `telemetry_rate_hz` | DOUBLE PRECISION, required |
| `configuration` | JSONB, required, default `{}` |
| `created_at`, `updated_at` | TIMESTAMPTZ, required |

### `mission_vehicles`

| Column | Type / constraint |
|---|---|
| `id` | UUID primary key |
| `mission_id` | UUID, required, references `missions` with cascade delete |
| `vehicle_definition_id` | UUID, required, references `vehicle_definitions` |
| starting position | latitude, longitude, altitude fields |
| `configuration` | JSONB, required, default `{}` |
| uniqueness | `(mission_id, vehicle_definition_id)` |

This association represents a mission fleet independently of waypoint assignment.
Its ID is the authoritative mission-scoped vehicle reference for waypoints and
mission APIs.

### `waypoints`

Columns are `id` UUID primary key; `mission_id` UUID required and cascading;
`vehicle_id` nullable; `sequence` integer required; latitude, longitude, and
`altitude_m` required doubles; optional `target_speed_mps` and `arrival_radius_m`;
and required `action`. `vehicle_id` is the mission-scoped `mission_vehicles.id`; the
reusable static definition remains available through that association. Add uniqueness on
`(mission_id, vehicle_id, sequence)` and indexes for mission, vehicle, and sequence.

### `network_profiles`

Required fields are `id` UUID primary key, `name` VARCHAR, `base_latency_ms`,
`jitter_ms`, `packet_loss_percent`, `duplicate_percent`, and
`disconnect_probability` doubles, disconnect duration minimum/maximum integers, and
`created_at` TIMESTAMPTZ. All numeric network parameters are validated at the boundary.

### `simulation_runs`

Required fields are `id` UUID primary key, `mission_id` UUID reference,
`status` controlled enum, `random_seed` BIGINT, `simulation_speed` DOUBLE PRECISION,
`configuration` JSONB, optional `started_at` and `completed_at`, and required
`created_at`. Configuration is an immutable snapshot after start.

### `run_vehicles`

Required fields are `id` UUID primary key, `run_id` UUID cascading reference,
`vehicle_definition_id` UUID reference, optional starting latitude/longitude/
altitude, optional `network_profile_id` reference, and `configuration` JSONB. Enforce
uniqueness on `(run_id, vehicle_definition_id)`.

`run_vehicles.id` is the canonical run-scoped vehicle ID in telemetry, events, and
run APIs. This prevents repeated mission runs from sharing dynamic identity.

### `telemetry_samples`

Required fields are `id` BIGSERIAL primary key, `event_id` UUID, `run_id` UUID,
`vehicle_id` UUID referencing `run_vehicles`, `sequence` BIGINT, `sim_time_ms` BIGINT,
`received_at` TIMESTAMPTZ, position/altitude doubles, heading/speed/battery doubles,
and mission/communications state enums. Enforce uniqueness on
`(run_id, vehicle_id, sequence)` and index `(run_id, sim_time_ms)` plus
`(run_id, vehicle_id, sim_time_ms)`.

`event_id` preserves the telemetry envelope identity in durable storage. The sequence
key remains the required idempotency constraint.

### `mission_events`

Required fields are `id` UUID primary key (the canonical event ID), `run_id` UUID,
nullable `vehicle_id` referencing `run_vehicles`, `event_type`, `severity`,
`schema_version`, `sim_time_ms`, `timestamp` TIMESTAMPTZ, and `payload` JSONB. Index
`(run_id, sim_time_ms)`, `(run_id, vehicle_id, sim_time_ms)`, and
`(run_id, event_type)`.

### `failure_injections`

Required fields are `id` UUID primary key, `run_id` UUID, nullable `vehicle_id` UUID,
`failure_type`, optional start/end simulation times, `configuration` JSONB, and
`created_at` TIMESTAMPTZ. Run and vehicle references are cascading or restricted
according to the final retention policy.

### `debriefs`

Required fields are `id` UUID primary key, `run_id` UUID, optional `provider` and
`model`, optional `structured_result` JSONB, and `generated_at` TIMESTAMPTZ.

## Referential and transaction rules

- A run references one mission and snapshots all mutable mission configuration.
- A run vehicle belongs to exactly one run.
- A telemetry sample's vehicle must belong to its run.
- Events and failures cannot reference a vehicle from another run.
- Configuration mutations are transactional.
- Telemetry batches use conflict-safe insert semantics.
- Worker retries must not duplicate samples or events.
- Failed transactions roll back and emit structured error logs.

## Retention and cleanup

The public profile must provide an explicit cleanup utility. It may keep the seeded
demo run and recent public runs, delete older telemetry-heavy runs, and retain
aggregate benchmark summaries. No development data is deleted automatically unless an
explicit setting enables it.

For a deliberate local reset, run `make reset-local`. The command is confirmation-gated,
clears the application tables and Redis stream database, and seeds mission definitions
without creating a run. Use `PYTHONPATH=apps/api python3 scripts/reset_local_data.py
--confirm --empty` when an empty catalog is needed for UI testing. This utility is for
the local development environment only; it does not rewrite Git history or target a
deployed database.

## Migrations

Alembic owns reviewed schema migrations. The initial migration establishes the
mission association table, run-scoped IDs, durable telemetry event IDs, enum
enforcement, and delete behavior. The Phase 14 migration expands
`simulation_runs.random_seed` to `BIGINT`, matching the documented run contract and
allowing the full deterministic seed range.

## Resolved schema decisions

- `mission_vehicles` is the mission-to-vehicle association.
- Waypoints reference `mission_vehicles.id`; reusable definitions remain separate.
- `missions.status` and `simulation_runs.status` are distinct definition and
  execution lifecycles.
- Telemetry retains `event_id` and is idempotent on `(run_id, vehicle_id, sequence)`.
- JSONB configuration is treated as an immutable run snapshot after start; future
  schema-versioned configuration changes require a migration and contract update.
