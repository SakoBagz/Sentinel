# Sentinel REST API Contract

Status: Phase 13 implementation baseline
Date: 2026-08-12

## Conventions

- Base prefix: `/api`.
- JSON request and response bodies use `snake_case`.
- IDs are UUID strings.
- Timestamps are ISO-8601 UTC; simulation time is an integer `sim_time_ms`.
- External request bodies are validated with Pydantic on the backend and Zod on the
  frontend client boundary.
- Historical results are paginated or bounded by time windows.
- Domain state values are controlled enums, never arbitrary strings.
- Errors use a stable envelope and never expose provider secrets or stack traces.

## Health

### `GET /api/health`

Returns service and dependency state. The response should distinguish the API process,
PostgreSQL, and Redis/Valkey, for example:

```json
{
  "status": "ok",
  "service": "api",
  "dependencies": {
    "postgres": "ok",
    "redis": "ok"
  }
}
```

If a dependency is unavailable, the endpoint remains useful and reports degraded
state with a non-success health status appropriate to the deployment probe.

## Mission endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/missions` | Create a mission definition |
| GET | `/api/missions` | List missions with pagination |
| GET | `/api/missions/{mission_id}` | Retrieve mission and configuration |
| PATCH | `/api/missions/{mission_id}` | Update editable mission fields |
| DELETE | `/api/missions/{mission_id}` | Delete an unused mission |

Create/update accepts metadata, scenario type, mission configuration, assigned
vehicles, waypoints, and network profile references as defined by the domain model.
Mutation is rejected once an active run has started unless the field is explicitly
versioned as a new mission revision.

## Waypoint endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/missions/{mission_id}/waypoints` | Add a waypoint |
| PATCH | `/api/waypoints/{waypoint_id}` | Move or edit a waypoint |
| DELETE | `/api/waypoints/{waypoint_id}` | Remove a waypoint |

Waypoint sequence is validated for the mission/vehicle route. Allowed actions are
`TRANSIT`, `HOLD`, `SURVEY`, and `RETURN`.

## Vehicle endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/missions/{mission_id}/vehicles` | Assign/configure a vehicle |
| GET | `/api/missions/{mission_id}/vehicles` | List mission vehicles |
| DELETE | `/api/missions/{mission_id}/vehicles/{vehicle_id}` | Remove an assignment |

The `vehicle_id` in mission endpoints identifies the mission's reusable vehicle
association. Once a run exists, run endpoints use `run_vehicles.id` as their vehicle
identifier.

## Run endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/missions/{mission_id}/runs` | Create an immutable run snapshot |
| GET | `/api/runs/{run_id}` | Retrieve run status and configuration |
| GET | `/api/runs/{run_id}/vehicles` | Retrieve run-scoped vehicle identities |
| GET | `/api/runs/{run_id}/snapshot` | Retrieve bounded current/final telemetry for reconnect |
| POST | `/api/runs/{run_id}/start` | Start simulation |
| POST | `/api/runs/{run_id}/pause` | Pause simulation |
| POST | `/api/runs/{run_id}/resume` | Resume simulation |
| POST | `/api/runs/{run_id}/stop` | Stop/abort an active run |

Creating a run records the seed and configuration. If no seed is supplied, the server
generates one and returns it. Starting a run is idempotent for an already-running run
or returns a conflict according to the final command semantics; it must never create
a second run accidentally.

## Live and historical data

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/runs/{run_id}/vehicles` | Current or final run-vehicle summaries |
| GET | `/api/runs/{run_id}/events` | Paginated/time-window event history |
| GET | `/api/runs/{run_id}/telemetry` | Paginated/time-window telemetry |
| GET | `/api/runs/{run_id}/metrics` | Run metrics and sequence statistics |

Historical query parameters:

```text
start_ms   optional inclusive simulation-time lower bound
end_ms     optional exclusive simulation-time upper bound
limit      bounded page size
cursor     opaque continuation cursor
vehicle_id optional run-scoped vehicle filter
event_type optional event filter
severity   optional severity filter
```

The server chooses a safe maximum `limit`. Large replay windows require paging or a
server-side downsample parameter; the API must not return millions of rows by default.

## Failure injection

### `POST /api/runs/{run_id}/failures`

Simulation-only mutation. The request contains a run-scoped optional vehicle ID,
allowed `failure_type`, duration or end time, and validated configuration.

Allowed values:

```text
COMMUNICATIONS_BLACKOUT
HIGH_LATENCY
PACKET_LOSS
GPS_QUALITY_DEGRADATION
BATTERY_ANOMALY
SENSOR_UNAVAILABLE
SERVICE_DELAY
```

Every accepted injection produces `failure.injected`; clearing it produces
`failure.cleared`. Weaponized or targeting-related options do not exist in the schema.

## Replay

### `GET /api/runs/{run_id}/replay`

Returns replay metadata plus bounded telemetry/event data for a requested time window.
It accepts `start_ms`, `end_ms`, `vehicle_id`, `limit`, `cursor`, and an optional
`sample_rate_hz`/downsample hint. The server returns persisted data, not a newly
executed simulation.

## AI endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/runs/{run_id}/debrief` | Generate or retrieve structured debrief |
| POST | `/api/runs/{run_id}/assistant` | Ask the read-only Mission Analyst |

Assistant requests contain a user message and optional conversation context with a
bounded size. Responses follow the structured schema in `AI_ASSISTANT.md`. Quota,
rate, and provider errors are explicit and do not fail core run/replay endpoints.

The response includes `run_id`, `answer`, controlled `confidence`, bounded `evidence`
references, `limitations`, provider/model metadata, and optional structured debrief
`sections`. The UI renders text only and turns evidence into replay links; it does not
render provider HTML.

## Error envelope

The baseline error shape is:

```json
{
  "error": {
    "code": "RUN_INVALID_STATE",
    "message": "The run cannot be resumed from COMPLETED.",
    "request_id": "uuid",
    "details": {}
  }
}
```

Expected categories include validation, not found, conflict/invalid state, limit
exceeded, dependency unavailable, and internal error. Internal details are logged,
not returned to anonymous clients.

## Versioning and compatibility

The initial API is versioned by the `/api` contract plus versioned payload envelopes.
Breaking payload changes require a documented contract revision and migration. Event
schema versions are independent of REST route versions.

## Public demo protections

When `PUBLIC_DEMO=true`, the server enforces `MAX_VEHICLES=50`,
`MAX_MISSION_DURATION_MINUTES=15`, `MAX_RUNS_PER_SESSION=5`,
`MAX_AI_QUESTIONS_PER_RUN=10`, and `MAX_TELEMETRY_RATE_HZ=5`. The frontend may explain
these limits but cannot be the enforcement point.

## Remaining API hardening

- `POST /stop` is the public command name and transitions a run to `ABORTED`.
- Mission and run status are separate lifecycles.
- Anonymous session identity/rate-limit storage remains a deployment concern for the
  public hosted profile.
- Mission, event, and telemetry history use bounded cursor pagination; offsets are
  intentionally not part of the MVP contract.
