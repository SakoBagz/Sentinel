# Sentinel Architecture

Status: Phase 13 implementation baseline
Date: 2026-08-12

## Architectural style

Sentinel is a modular monolith. The initial deployment has one FastAPI application,
one Next.js application, one simulator process or task, PostgreSQL for durable state,
and Redis/Valkey Streams for transient event distribution. Logical modules have clear
interfaces but are not independently deployed services.

```text
Next.js Web UI
  ├─ planner, live operations, replay, debrief
  └─ REST client + WebSocket client
            │
            ▼
FastAPI modular monolith
  ├─ mission / vehicle / run APIs
  ├─ simulation orchestration
  ├─ telemetry and event services
  ├─ replay and metrics services
  └─ read-only AI analysis service
       │                         │
       ▼                         ▼
PostgreSQL                 Redis/Valkey Streams
 durable source            transient fan-out
       ▲                         ▲
       └──────── persistence ─────┘
                 ▲
          deterministic simulator
```

## Logical module boundaries

### Web application

Next.js App Router owns route composition and presentation. TanStack Query owns
mission definitions and historical server state. Zustand owns live telemetry,
selection, playback, and simulation UI state. MapLibre plus OpenFreeMap is isolated
behind map components so the tile provider can change without domain changes.

### API and application services

FastAPI route modules perform boundary validation, authorization/limit checks when
applicable, service invocation, and response serialization. They do not contain
mission state transitions, navigation, battery rules, or persistence algorithms.

Application services coordinate repositories and infrastructure adapters:

- `MissionService` — mission definitions, vehicles, waypoints, profiles.
- `RunService` — run snapshots and lifecycle commands.
- `TelemetryService` — envelope validation, sequence accounting, persistence handoff.
- `EventService` — event taxonomy, severity, persistence, historical queries.
- `ReplayService` — time-window queries and replay data shaping.
- `MetricsService` — counters, latency summaries, and diagnostics.
- `DebriefService` — deterministic summaries and AI provider orchestration.

### Domain modules

The domain layer is framework-independent where practical:

- mission and run aggregates
- vehicle state and explicit state machines
- waypoint navigation and geospatial utilities
- battery behavior
- communications and network profiles
- failure injection
- versioned telemetry and event contracts
- seeded random source and simulation clock

### Infrastructure adapters

Database repositories, Redis Streams, WebSocket broadcasting, provider clients,
structured logging, and metrics adapters live outside the domain. The simulator
publishes domain envelopes through an application port and never synchronously waits
for a PostgreSQL write on its hot path.

## Data flows

### Configuration flow

Browser → REST API → application service → PostgreSQL. A run snapshots the mission
definition, vehicle configuration, network profiles, and random seed so later edits
to the reusable mission cannot change historical results.

### Simulation flow

Simulator advances its deterministic clock, updates vehicle states, produces
telemetry/events, applies network impairment, and publishes delivered envelopes to
per-run Redis Streams. Consumers independently broadcast to WebSockets, update
metrics, and batch durable writes.

### Historical flow

Browser → REST API → PostgreSQL repositories → paginated/time-window response. Replay
reads stored telemetry and events only. It never invokes the simulator.

### AI flow

Browser → assistant/debrief endpoint → provider adapter → read-only internal tools →
PostgreSQL summaries/events/telemetry → structured response with evidence references.
The provider cannot reach mutation services.

## Reliability boundaries

- PostgreSQL remains authoritative if Redis/Valkey restarts.
- Redis streams are reconnectable and may lose transient in-flight state.
- Consumers use idempotent writes and can retry.
- WebSocket clients reconnect with bounded exponential backoff and restore topics.
- A backend cold start is presented as a recoverable service state in the UI.
- AI is non-critical; provider failure degrades only analysis features.

## Repository target

The intended repository shape is:

```text
README.md  AGENTS.md  docker-compose.yml  .env.example  Makefile  package.json
docs/
apps/web/  apps/api/  simulator/  scripts/  infrastructure/
```

The detailed directory layout is defined by the master specification. Phase 0 creates
the docs and `AGENTS.md` only; Phase 1 will create the executable skeleton.

## Runtime profiles

| Concern | Local engineering | Public demo |
|---|---|---|
| Frontend | Next.js local | Vercel Hobby |
| Backend | FastAPI local | Render free web service |
| Durable data | local PostgreSQL | Neon free PostgreSQL |
| Transient events | local Redis/Valkey | Render Key Value / Valkey |
| Maps | MapLibre + OpenFreeMap | same |
| AI | Gemini, mock, or disabled | Gemini behind quota limits |
| Scale goal | 100–1,000+ UAVs | 25–50 UAVs |

No provider is allowed to leak into domain logic. Provider URLs and credentials are
environment configuration.

## Invariants

1. Every run stores its seed and immutable configuration snapshot.
2. Every external event is versioned and validated at the boundary.
3. Every telemetry envelope has an event ID and per-vehicle monotonic sequence.
4. Durable telemetry writes are idempotent on `(run_id, vehicle_id, sequence)`.
5. Simulation state advances independently of communications delivery.
6. Replays use persisted telemetry only.
7. AI has no mutation capability.
8. Public limits are enforced server-side.

## Implemented architecture decisions

The `mission_vehicles` association, run-scoped vehicle ID convention, durable
telemetry event ID, and distinct mission/run status semantics are implemented and
documented in `PRODUCT_SPEC.md` and `DATABASE.md`. Revisions to these contracts
require a migration or versioned API change.
