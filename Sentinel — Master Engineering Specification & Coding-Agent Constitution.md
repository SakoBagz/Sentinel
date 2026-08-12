# Sentinel — Master Engineering Specification & Coding-Agent Constitution

## 0. Your Role

You are the principal software engineer responsible for designing and implementing **Sentinel**, a portfolio-grade real-time UAV mission operations platform.

Treat this document as the project's authoritative product and engineering specification.

Do not casually replace technologies, architectural decisions, domain terminology, persistence strategies, protocols, schemas, or safety boundaries defined here.

If you believe a material change is necessary:

1. Identify the problem.
2. Explain the tradeoff.
3. Propose the change.
4. Wait for the project's architecture documentation to be updated before implementing the change.

Do not attempt to build the entire application in one pass.

Work phase-by-phase using the milestones and acceptance criteria defined later in this document.

---

# 1. Product Definition

**Sentinel is a real-time mission-planning, UAV fleet simulation, telemetry monitoring, failure-injection, replay, performance-analysis, and AI-assisted mission-debrief platform.**

An operator should be able to:

1. Create a mission.
2. Add simulated UAVs.
3. Place UAV starting positions and routes on an interactive map.
4. Configure UAV parameters.
5. Configure simulated communications/network conditions.
6. Start a deterministic simulation.
7. Watch UAV positions and telemetry update in real time.
8. Monitor vehicle state, battery, communications health, warnings, and mission progress.
9. Inject simulated failures.
10. Observe degraded communications and recovery.
11. Complete and persist the mission.
12. Replay the completed mission.
13. Examine operational and system metrics.
14. Ask an AI Mission Analyst questions about what happened.
15. Click AI evidence references to inspect the underlying mission event.

The application should feel like a credible **mission operations / command-and-control / fleet-management engineering platform**, not a video game.

---

# 2. Safety and Product Scope

Sentinel is a **non-weaponized UAV simulation and fleet-operations platform**.

Supported scenarios include:

- search and rescue
- wildfire monitoring
- infrastructure inspection
- environmental surveying
- mapping
- disaster response
- communications relay
- scientific surveys
- emergency logistics simulation

Do not implement:

- weapon control
- target selection
- strike planning
- autonomous engagement
- firing solutions
- targeting recommendations
- weaponized payload control
- evasion of defense systems
- stealth optimization
- autonomous pursuit of human targets

The AI Mission Analyst must remain **read-only**.

The AI may:

- retrieve telemetry
- retrieve mission events
- calculate summaries
- compare vehicles
- identify anomalous operational behavior
- explain simulated failures
- generate post-mission summaries

The AI may not:

- issue UAV commands
- modify mission state
- modify waypoints
- launch vehicles
- reroute vehicles
- initiate failures
- perform tactical target selection

---

# 3. Primary Engineering Objective

Sentinel is not primarily an aerodynamics project.

It is a **software systems project using UAV operations as the domain**.

The project should demonstrate:

- real-time application architecture
- event-driven systems
- asynchronous programming
- distributed-systems concepts
- network failure handling
- geospatial interfaces
- simulation architecture
- WebSockets
- PostgreSQL
- Redis/Valkey Streams
- durable vs. ephemeral state
- idempotent processing
- sequence-based deduplication
- telemetry pipelines
- fault injection
- deterministic simulation
- replay systems
- performance measurement
- load testing
- AI tool calling
- grounded AI responses
- testing
- CI/CD
- cloud deployment
- graceful degradation

The target engineering story is:

> "Sentinel coordinates hundreds of simulated UAVs, processes real-time telemetry through an event-driven architecture, handles unreliable communications, records and replays missions, measures system performance, and provides evidence-grounded AI mission analysis."

---

# 4. Cost Constraint

## Hard requirement

The entire project must be buildable, testable, publicly deployable, and maintainable for:

**$0 recurring cost**

Do not introduce a required paid dependency.

Do not require:

- paid cloud instances
- paid databases
- paid map providers
- paid Redis services
- paid domains
- paid AI APIs
- paid observability services

If a recommended provider changes its free tier, preserve the system architecture and substitute another free provider.

All third-party integrations must be abstracted enough that providers can be replaced without major domain changes.

---

# 5. Development vs. Public Deployment Architecture

Sentinel has two operating profiles.

## 5.1 Local Engineering / Benchmark Mode

Purpose:

- development
- full testing
- large simulation runs
- profiling
- benchmarks
- 100–1,000+ UAV experiments

Everything runs locally.

Use:

- Docker Compose
- local PostgreSQL
- local Redis/Valkey
- local FastAPI
- local Next.js
- local simulator

Example target:

```text
SIM_MAX_VEHICLES=1000
TELEMETRY_RATE_HZ=10
PUBLIC_DEMO=false
```

This is where performance claims are measured.

---

## 5.2 Public Portfolio Demo Mode

Purpose:

Allow recruiters or visitors to experience Sentinel without consuming excessive free cloud resources.

Recommended cloud profile:

```text
Frontend:
Vercel Hobby

Backend:
Render Free Web Service

Database:
Neon Free PostgreSQL

Realtime transient state:
Render Free Key Value / Valkey

Maps:
MapLibre GL JS + OpenFreeMap

AI:
Gemini Developer API free tier

CI/CD:
GitHub Actions
```

Example limits:

```text
PUBLIC_DEMO=true
SIM_MAX_VEHICLES=50
TELEMETRY_RATE_HZ=5
MAX_MISSION_DURATION_MINUTES=15
MAX_RUNS_PER_SESSION=5
MAX_AI_QUESTIONS_PER_RUN=10
```

The limits are intentional engineering controls.

The public interface should explain:

> Portfolio Demo Mode — cloud simulation capacity is intentionally limited. Higher-scale benchmark results are generated using the local benchmark environment.

---

# 6. Free-Tier Architecture Principle

The free public deployment must never be the only environment used to prove scalability.

Use:

```text
PUBLIC DEMO
25–50 UAVs
↓
shows product behavior
```

and:

```text
LOCAL BENCHMARK
100
250
500
1000 UAVs
↓
proves architecture/performance
```

Publish benchmark results in the README.

Never fabricate benchmark numbers.

---

# 7. Recommended Technology Stack

## Frontend

```text
TypeScript
React
Next.js App Router
Tailwind CSS
MapLibre GL JS
Zod
TanStack Query
Zustand
```

## Backend

```text
Python 3.12+
FastAPI
Pydantic
SQLAlchemy 2
Alembic
asyncio
```

## Durable Data

```text
PostgreSQL
```

Cloud provider:

```text
Neon
```

## Realtime / Event Infrastructure

```text
Redis protocol
Redis Streams
```

Cloud provider:

```text
Render Key Value / Valkey
```

Treat this service as **ephemeral**.

PostgreSQL remains the durable system of record.

## AI

Provider interface:

```text
MissionAnalystProvider
```

Initial implementation:

```text
Gemini Developer API
```

Required features:

```text
function/tool calling
structured outputs
```

Environment:

```text
AI_PROVIDER=gemini
```

Future supported values:

```text
gemini
openai
cloudflare
local
disabled
mock
```

Never hardcode domain logic to one AI vendor.

## Testing

```text
pytest
pytest-asyncio
Vitest
Playwright
```

## Local Infrastructure

```text
Docker
Docker Compose
```

## CI/CD

```text
GitHub Actions
```

## Maps

```text
MapLibre GL JS
OpenFreeMap
```

Do not require Google Maps or Mapbox.

---

# 8. Repository Structure

Create approximately:

```text
sentinel/
│
├── README.md
├── AGENTS.md
├── docker-compose.yml
├── .env.example
├── Makefile
├── package.json
│
├── docs/
│   ├── PRODUCT_SPEC.md
│   ├── ARCHITECTURE.md
│   ├── DOMAIN_MODEL.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── EVENT_CONTRACTS.md
│   ├── SIMULATION.md
│   ├── REALTIME.md
│   ├── REPLAY.md
│   ├── UI_SPEC.md
│   ├── AI_ASSISTANT.md
│   ├── TEST_PLAN.md
│   ├── PERFORMANCE.md
│   └── DEPLOYMENT.md
│
├── apps/
│   │
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── stores/
│   │   ├── types/
│   │   └── tests/
│   │
│   └── api/
│       ├── app/
│       │   ├── main.py
│       │   ├── config.py
│       │   │
│       │   ├── api/
│       │   │   ├── health.py
│       │   │   ├── missions.py
│       │   │   ├── vehicles.py
│       │   │   ├── runs.py
│       │   │   ├── failures.py
│       │   │   ├── replay.py
│       │   │   ├── metrics.py
│       │   │   └── ai.py
│       │   │
│       │   ├── domain/
│       │   │   ├── mission/
│       │   │   ├── vehicle/
│       │   │   ├── telemetry/
│       │   │   ├── events/
│       │   │   ├── network/
│       │   │   └── simulation/
│       │   │
│       │   ├── services/
│       │   │   ├── mission_service.py
│       │   │   ├── run_service.py
│       │   │   ├── telemetry_service.py
│       │   │   ├── event_service.py
│       │   │   ├── replay_service.py
│       │   │   ├── metrics_service.py
│       │   │   └── debrief_service.py
│       │   │
│       │   ├── db/
│       │   │   ├── models/
│       │   │   ├── repositories/
│       │   │   ├── session.py
│       │   │   └── migrations/
│       │   │
│       │   ├── realtime/
│       │   │   ├── redis.py
│       │   │   ├── streams.py
│       │   │   └── broadcaster.py
│       │   │
│       │   ├── websocket/
│       │   ├── metrics/
│       │   ├── logging/
│       │   └── ai/
│       │       ├── provider.py
│       │       ├── gemini.py
│       │       ├── tools.py
│       │       └── schemas.py
│       │
│       └── tests/
│
├── simulator/
│   ├── sentinel_sim/
│   │   ├── engine.py
│   │   ├── clock.py
│   │   ├── vehicle.py
│   │   ├── navigation.py
│   │   ├── mission.py
│   │   ├── battery.py
│   │   ├── network.py
│   │   ├── failures.py
│   │   ├── telemetry.py
│   │   └── random.py
│   │
│   └── tests/
│
├── scripts/
│   ├── seed_demo.py
│   ├── generate_scenario.py
│   ├── load_test.py
│   ├── benchmark.py
│   └── cleanup_demo_data.py
│
└── infrastructure/
    ├── render/
    ├── vercel/
    └── docs/
```

---

# 9. Architectural Style

Use a **modular monolith**.

Do not start with microservices.

Logical components:

```text
Mission
Simulation
Telemetry
Events
Replay
Metrics
AI Analysis
```

These should have clean interfaces internally.

They do not need to be independently deployed services.

Architecture:

```text
                  ┌─────────────────────────┐
                  │     Next.js Web UI      │
                  │                         │
                  │ Mission Planner         │
                  │ Live Map                │
                  │ Fleet Monitor           │
                  │ Replay                  │
                  │ AI Debrief              │
                  └────────────┬────────────┘
                               │
                        REST + WebSocket
                               │
                  ┌────────────▼────────────┐
                  │        FastAPI          │
                  │                         │
                  │ Mission Service         │
                  │ Run Service             │
                  │ Telemetry Service       │
                  │ Event Service           │
                  │ Replay Service          │
                  │ Metrics Service         │
                  │ AI Service              │
                  └─────────┬───────┬───────┘
                            │       │
                     ┌──────▼───┐ ┌─▼───────────┐
                     │PostgreSQL│ │Redis/Valkey │
                     │ durable  │ │ transient   │
                     └──────────┘ └─────▲───────┘
                                        │
                                 Telemetry Events
                                        │
                            ┌───────────┴────────────┐
                            │   Simulation Engine   │
                            │                       │
                            │ UAV-001               │
                            │ UAV-002               │
                            │ ...                   │
                            │ UAV-N                 │
                            └───────────────────────┘
```

---

# 10. Architectural Rules

Mandatory:

- PostgreSQL is the durable system of record.
- Redis/Valkey is transient infrastructure.
- Simulation logic must not depend directly on frontend code.
- Simulation hot path must not synchronously block on PostgreSQL writes.
- REST is for configuration and historical data.
- WebSockets are for live server-to-client delivery.
- Replays use stored telemetry.
- Replays do not rerun simulations.
- Every external event contract is versioned.
- Every telemetry message has an event ID.
- Every vehicle has a monotonically increasing telemetry sequence.
- Persisted processing must be idempotent.
- Simulation runs store their random seed.
- Domain logic must not live inside API route handlers.
- Important events are persisted at full fidelity.
- High-frequency telemetry may be downsampled for durable storage.
- Free cloud limits must be enforced server-side.

---

# 11. Core Domain Terminology

Use these names consistently.

## Mission

A reusable definition of a planned UAV operation.

```text
Mission
```

contains:

- metadata
- vehicles
- routes
- waypoints
- default parameters

A Mission can be executed multiple times.

---

# 12. Simulation Run

One execution of a Mission.

Example:

```text
Mission:
Angeles Forest Survey

Simulation Runs:
Run #1 — baseline
Run #2 — 10% packet loss
Run #3 — 20-second outage
Run #4 — battery threshold test
```

Each run must preserve:

```text
mission definition
configuration
random seed
started timestamp
completed timestamp
results
events
telemetry history
```

---

# 13. Mission Status

Enum:

```text
DRAFT
READY
RUNNING
PAUSED
COMPLETED
ABORTED
```

Do not use arbitrary strings.

---

# 14. UAV Definition

Static configuration:

```text
VehicleDefinition

id
callsign
vehicle_type
max_speed_mps
cruise_speed_mps
battery_capacity
telemetry_rate_hz
configuration
```

Example callsigns:

```text
UAV-001
UAV-002
UAV-003
```

---

# 15. UAV Dynamic State

```text
VehicleState

latitude
longitude
altitude_m
heading_deg
ground_speed_mps

battery_percent

mission_state
communications_state

current_waypoint_index

last_telemetry_time
sequence
```

---

# 16. Mission State Machine

Use explicit valid transitions.

Primary states:

```text
IDLE
READY
LAUNCHING
TRANSIT
EXECUTING
RETURNING
LANDED
COMPLETE
PAUSED
ABORTED
```

Example:

```text
IDLE
 ↓
READY
 ↓
LAUNCHING
 ↓
TRANSIT
 ↓
EXECUTING
 ↓
RETURNING
 ↓
LANDED
 ↓
COMPLETE
```

Invalid transitions must fail explicitly.

Example:

```text
COMPLETE → LAUNCHING
```

must not occur without a new simulation run.

---

# 17. Communications State

Communication health is separate from mission state.

Enum:

```text
HEALTHY
DEGRADED
STALE
DISCONNECTED
RECOVERING
```

Default configurable behavior:

```text
HEALTHY
recent successful telemetry and acceptable network statistics

DEGRADED
telemetry continues but latency/loss exceeds threshold

STALE
telemetry has not arrived within stale threshold

DISCONNECTED
telemetry has not arrived within disconnect threshold

RECOVERING
communications recently resumed and state reconciliation is occurring
```

All thresholds must be configuration values.

---

# 18. Waypoint Model

```text
Waypoint

id
mission_id
vehicle_id nullable
sequence

latitude
longitude
altitude_m
target_speed_mps

action
arrival_radius_m
```

Allowed MVP actions:

```text
TRANSIT
HOLD
SURVEY
RETURN
```

---

# 19. Simulation Philosophy

Do not initially implement realistic aerodynamics.

Use a deterministic **kinematic simulation**.

The objective is UAV operational software, not computational fluid dynamics.

Each tick:

```text
1. Advance simulation clock.
2. Load current vehicle state.
3. Determine current waypoint.
4. Calculate bearing toward target.
5. Calculate distance toward target.
6. Move vehicle according to speed × dt.
7. Adjust heading.
8. Adjust altitude toward target.
9. Reduce battery.
10. Determine whether waypoint was reached.
11. Evaluate state transitions.
12. Generate telemetry.
13. Apply simulated network impairment.
14. Publish delivered messages.
15. Generate operational events where necessary.
```

---

# 20. Simulation Timing

Default local configuration:

```text
SIMULATION_TICK_HZ=10
TELEMETRY_RATE_HZ=10
```

Cloud demo:

```text
TELEMETRY_RATE_HZ=5
```

Do not tie:

```text
simulation tick rate
```

to:

```text
database persistence rate
```

They solve different problems.

---

# 21. Position Calculations

Provide tested geospatial utilities:

```text
distance_between()
bearing_between()
destination_point()
interpolate_position()
```

For MVP use:

- Haversine distance
- initial bearing
- destination-point calculation

These are adequate for local/regional simulation.

---

# 22. Waypoint Arrival

Default:

```text
WAYPOINT_ARRIVAL_RADIUS_M=10
```

When:

```text
distance_to_target <= arrival_radius
```

mark waypoint complete.

Generate:

```text
vehicle.waypoint_reached
```

Increment waypoint sequence.

---

# 23. Battery Model

Keep battery simulation understandable.

Conceptually:

```text
drain =
base consumption
+ speed component
+ optional vehicle-type modifier
```

Thresholds:

```text
battery <= 30%
→ battery.low

battery <= configured return threshold
→ vehicle transitions to RETURNING

battery <= 5%
→ battery.critical
```

Return threshold is configurable per mission/vehicle.

---

# 24. Behavior During Communications Loss

Critical requirement:

**The UAV simulation must continue when ground communications are unavailable.**

Communications failure does not freeze the simulated vehicle.

During a connection outage:

```text
vehicle continues mission
simulator continues state updates
telemetry may be dropped or delayed
ground UI becomes stale
```

Upon recovery:

```text
DISCONNECTED
↓
RECOVERING
↓
state reconciliation
↓
HEALTHY
```

This creates meaningful distributed-state behavior.

---

# 25. Network Simulation

Each vehicle has:

```text
NetworkProfile
```

Fields:

```text
base_latency_ms
jitter_ms
packet_loss_percent
duplicate_percent

disconnect_probability
disconnect_duration_min_ms
disconnect_duration_max_ms
```

For every generated message:

```text
1. Evaluate connection state.
2. Determine whether message is dropped.
3. Determine whether it is duplicated.
4. Sample delivery latency.
5. Queue the message for delayed delivery.
6. Deliver when scheduled simulation time arrives.
```

---

# 26. Failure Injection

Provide a simulation-only control panel.

Safe failure types:

```text
COMMUNICATIONS_BLACKOUT
HIGH_LATENCY
PACKET_LOSS
GPS_QUALITY_DEGRADATION
BATTERY_ANOMALY
SENSOR_UNAVAILABLE
SERVICE_DELAY
```

Example:

```text
Vehicle:
UAV-014

Failure:
COMMUNICATIONS_BLACKOUT

Duration:
20 seconds

[Inject Failure]
```

Every injected failure generates:

```text
failure.injected
```

and later:

```text
failure.cleared
```

Persist both.

---

# 27. Determinism

Every Simulation Run must include:

```text
random_seed
```

All randomness must derive from the run's seeded random-number generator.

Given:

```text
mission configuration
+
random seed
```

the simulation should reproduce:

```text
network failures
packet loss
latency samples
battery anomalies
failure timing
```

as consistently as practical.

Never use global uncontrolled randomness in simulation domain logic.

---

# 28. Telemetry Contract

All telemetry uses a versioned envelope.

Example:

```json
{
  "schema_version": 1,
  "event_id": "uuid",
  "mission_id": "uuid",
  "run_id": "uuid",
  "vehicle_id": "uuid",
  "sequence": 9812,
  "sim_time_ms": 183400,
  "emitted_at": "2026-08-12T01:22:10Z",
  "type": "vehicle.telemetry",
  "payload": {
    "latitude": 34.1521,
    "longitude": -118.2413,
    "altitude_m": 121.7,
    "heading_deg": 218.5,
    "ground_speed_mps": 18.1,
    "battery_percent": 73.2,
    "mission_state": "EXECUTING",
    "communications_state": "HEALTHY"
  }
}
```

Validate external boundaries using Pydantic/Zod.

---

# 29. Sequence Numbers

Every vehicle maintains:

```text
sequence
```

starting from zero and monotonically incrementing for generated telemetry.

This enables:

## Duplicate detection

```text
100
101
101
102
```

## Missing-message detection

```text
100
101
104
```

Missing:

```text
102
103
```

## Out-of-order detection

```text
100
102
101
103
```

Expose relevant statistics in the UI.

---

# 30. Idempotency

Durable telemetry persistence must use a uniqueness constraint equivalent to:

```text
(run_id, vehicle_id, sequence)
```

A duplicate message must not create duplicate historical records.

Workers must be safe to retry.

---

# 31. Event Taxonomy

Centralize event names.

Do not invent them throughout the codebase.

Mission:

```text
mission.created
mission.updated
mission.started
mission.paused
mission.resumed
mission.completed
mission.aborted
```

Vehicle:

```text
vehicle.ready
vehicle.launched
vehicle.waypoint_reached
vehicle.returning
vehicle.landed
vehicle.completed
vehicle.telemetry
```

Communications:

```text
communications.degraded
communications.stale
communications.lost
communications.recovering
communications.restored
```

Battery:

```text
battery.low
battery.critical
```

Failure injection:

```text
failure.injected
failure.cleared
```

System:

```text
system.warning
system.error
```

---

# 32. Event Severity

Enum:

```text
INFO
WARNING
CRITICAL
```

Example:

```text
vehicle.waypoint_reached → INFO
communications.degraded → WARNING
communications.lost → CRITICAL
battery.critical → CRITICAL
```

---

# 33. Redis / Valkey Streams

Use Streams as the real-time internal event mechanism.

Example names:

```text
sentinel:run:{run_id}:telemetry
sentinel:run:{run_id}:events
```

Logical consumers:

```text
realtime_broadcaster
persistence_worker
metrics_processor
```

Conceptually:

```text
Simulator
    ↓
Redis/Valkey Stream
    ├──── WebSocket Broadcaster
    ├──── Metrics Processor
    └──── Persistence Worker
                ↓
            PostgreSQL
```

Redis/Valkey is not authoritative durable storage.

If it restarts:

- current transient state may disappear,
- completed durable mission data must remain available,
- the application should recover gracefully.

---

# 34. PostgreSQL Database

Minimum tables:

```text
missions
vehicle_definitions
waypoints
network_profiles
simulation_runs
run_vehicles
telemetry_samples
mission_events
failure_injections
debriefs
```

---

# 35. `missions`

```text
id UUID PRIMARY KEY

name VARCHAR NOT NULL
description TEXT

scenario_type VARCHAR
status VARCHAR NOT NULL

created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 36. `vehicle_definitions`

```text
id UUID PRIMARY KEY

callsign VARCHAR NOT NULL
vehicle_type VARCHAR NOT NULL

max_speed_mps DOUBLE
cruise_speed_mps DOUBLE
battery_capacity DOUBLE
telemetry_rate_hz DOUBLE

configuration JSONB

created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 37. `waypoints`

```text
id UUID PRIMARY KEY

mission_id UUID REFERENCES missions(id)
vehicle_id UUID nullable

sequence INTEGER NOT NULL

latitude DOUBLE PRECISION NOT NULL
longitude DOUBLE PRECISION NOT NULL
altitude_m DOUBLE PRECISION NOT NULL

target_speed_mps DOUBLE PRECISION
arrival_radius_m DOUBLE PRECISION

action VARCHAR NOT NULL
```

Index:

```text
mission_id
vehicle_id
sequence
```

---

# 38. `network_profiles`

```text
id UUID PRIMARY KEY

name VARCHAR

base_latency_ms DOUBLE
jitter_ms DOUBLE
packet_loss_percent DOUBLE
duplicate_percent DOUBLE

disconnect_probability DOUBLE
disconnect_duration_min_ms INTEGER
disconnect_duration_max_ms INTEGER

created_at TIMESTAMPTZ
```

---

# 39. `simulation_runs`

```text
id UUID PRIMARY KEY

mission_id UUID REFERENCES missions(id)

status VARCHAR NOT NULL

random_seed BIGINT NOT NULL
simulation_speed DOUBLE NOT NULL

configuration JSONB NOT NULL

started_at TIMESTAMPTZ
completed_at TIMESTAMPTZ

created_at TIMESTAMPTZ
```

---

# 40. `run_vehicles`

```text
id UUID PRIMARY KEY

run_id UUID REFERENCES simulation_runs(id)
vehicle_definition_id UUID REFERENCES vehicle_definitions(id)

starting_latitude DOUBLE
starting_longitude DOUBLE
starting_altitude_m DOUBLE

network_profile_id UUID REFERENCES network_profiles(id)

configuration JSONB
```

---

# 41. `telemetry_samples`

```text
id BIGSERIAL PRIMARY KEY

run_id UUID NOT NULL
vehicle_id UUID NOT NULL

sequence BIGINT NOT NULL
sim_time_ms BIGINT NOT NULL

received_at TIMESTAMPTZ NOT NULL

latitude DOUBLE PRECISION
longitude DOUBLE PRECISION
altitude_m DOUBLE PRECISION

heading_deg DOUBLE PRECISION
ground_speed_mps DOUBLE PRECISION
battery_percent DOUBLE PRECISION

mission_state VARCHAR
communications_state VARCHAR
```

Unique:

```text
(run_id, vehicle_id, sequence)
```

Indexes:

```text
(run_id, sim_time_ms)

(run_id, vehicle_id, sim_time_ms)
```

---

# 42. `mission_events`

```text
id UUID PRIMARY KEY

run_id UUID NOT NULL
vehicle_id UUID nullable

event_type VARCHAR NOT NULL
severity VARCHAR NOT NULL

sim_time_ms BIGINT NOT NULL
timestamp TIMESTAMPTZ NOT NULL

payload JSONB NOT NULL
```

Indexes:

```text
(run_id, sim_time_ms)

(run_id, vehicle_id, sim_time_ms)

(run_id, event_type)
```

---

# 43. `failure_injections`

```text
id UUID PRIMARY KEY

run_id UUID NOT NULL
vehicle_id UUID nullable

failure_type VARCHAR NOT NULL

started_sim_time_ms BIGINT
ended_sim_time_ms BIGINT

configuration JSONB

created_at TIMESTAMPTZ
```

---

# 44. `debriefs`

```text
id UUID PRIMARY KEY

run_id UUID NOT NULL

provider VARCHAR
model VARCHAR

structured_result JSONB
generated_at TIMESTAMPTZ
```

---

# 45. Telemetry Persistence Strategy

Do not synchronously write every simulation message to PostgreSQL.

Default:

```text
Simulation:
10 Hz

Live telemetry:
10 Hz local
5 Hz public cloud

Durable telemetry:
2 Hz

Important mission events:
100%
```

Persistence frequency must be configurable.

The persistence worker should batch inserts.

---

# 46. Free Database Retention

Public deployment has limited database storage.

Provide cleanup utilities.

Example:

```text
scripts/cleanup_demo_data.py
```

Possible cloud retention:

```text
keep deterministic demo run
keep recent N public runs
delete older telemetry-heavy runs
retain aggregate benchmark summaries
```

Never delete development data automatically unless explicitly configured.

---

# 47. REST API

Prefix:

```text
/api
```

Health:

```text
GET /api/health
```

Mission:

```text
POST   /api/missions
GET    /api/missions
GET    /api/missions/{mission_id}
PATCH  /api/missions/{mission_id}
DELETE /api/missions/{mission_id}
```

Waypoints:

```text
POST   /api/missions/{mission_id}/waypoints
PATCH  /api/waypoints/{waypoint_id}
DELETE /api/waypoints/{waypoint_id}
```

Vehicles:

```text
POST   /api/missions/{mission_id}/vehicles
GET    /api/missions/{mission_id}/vehicles
DELETE /api/missions/{mission_id}/vehicles/{vehicle_id}
```

Runs:

```text
POST /api/missions/{mission_id}/runs

GET /api/runs/{run_id}

POST /api/runs/{run_id}/start
POST /api/runs/{run_id}/pause
POST /api/runs/{run_id}/resume
POST /api/runs/{run_id}/stop
```

Live/historical data:

```text
GET /api/runs/{run_id}/vehicles
GET /api/runs/{run_id}/events
GET /api/runs/{run_id}/telemetry
GET /api/runs/{run_id}/metrics
```

Failures:

```text
POST /api/runs/{run_id}/failures
```

Replay:

```text
GET /api/runs/{run_id}/replay
```

AI:

```text
POST /api/runs/{run_id}/debrief
POST /api/runs/{run_id}/assistant
```

---

# 48. API Pagination

Historical events and telemetry endpoints must support pagination or time windows.

Do not return millions of records in a single response.

Example:

```text
start_ms
end_ms
limit
cursor
vehicle_id
```

---

# 49. WebSocket Protocol

Endpoint:

```text
/ws/runs/{run_id}
```

Client subscription:

```json
{
  "type": "subscribe",
  "topics": [
    "telemetry",
    "events",
    "metrics"
  ]
}
```

Message examples:

```json
{
  "type": "vehicle.telemetry",
  "data": {}
}
```

```json
{
  "type": "communications.lost",
  "data": {}
}
```

At higher scale support:

```json
{
  "type": "telemetry.batch",
  "messages": []
}
```

---

# 50. WebSocket Reliability

Implement:

```text
heartbeat/ping

client reconnect

exponential reconnect backoff

subscription restoration

graceful server disconnect

connection cleanup
```

Frontend must clearly show:

```text
LIVE
RECONNECTING
DISCONNECTED
```

for server connection status.

---

# 51. WebSocket Batching

MVP may send individual telemetry updates.

Do not prematurely optimize.

At higher scale, benchmark batching windows such as:

```text
50 ms
100 ms
```

before implementing them.

---

# 52. Frontend Routes

Primary routes:

```text
/
```

Landing/demo page.

```text
/missions
```

Mission list.

```text
/missions/[id]/plan
```

Mission planner.

```text
/runs/[id]/live
```

Live mission operations.

```text
/runs/[id]/replay
```

Mission replay.

```text
/runs/[id]/debrief
```

Post-mission analysis.

---

# 53. Mission Planner UI

Layout approximately:

```text
┌──────────────────────────────────────────────────────────────┐
│ SENTINEL             MISSION PLANNER               SAVE     │
├──────────────┬────────────────────────────┬──────────────────┤
│ UAV FLEET    │                            │ MISSION CONFIG   │
│              │                            │                  │
│ UAV-01       │                            │ Altitude         │
│ UAV-02       │            MAP             │ Speed            │
│ UAV-03       │                            │ Return battery   │
│              │                            │ Network profile  │
│ + Add UAV    │                            │                  │
├──────────────┴────────────────────────────┴──────────────────┤
│ WAYPOINTS                                                    │
└──────────────────────────────────────────────────────────────┘
```

Map interactions:

```text
click map → add waypoint

drag waypoint → reposition

click UAV → select UAV

click waypoint → edit waypoint

delete waypoint

reorder waypoint sequence
```

Render:

```text
base/home position
UAV positions
waypoints
route polyline
survey regions later
```

---

# 54. Live Operations UI

This is the flagship screen.

```text
┌──────────────────────────────────────────────────────────────┐
│ SENTINEL        ANGELES SURVEY         RUNNING    00:18:32  │
├──────────────┬────────────────────────────┬──────────────────┤
│ FLEET        │                            │ VEHICLE DETAIL   │
│              │                            │                  │
│ UAV-01 ●     │                            │ UAV-07           │
│ UAV-02 ●     │             MAP            │ Battery 74%      │
│ UAV-03 ◐     │                            │ Speed 18 m/s     │
│ UAV-04 ○     │                            │ Latency 43 ms    │
│              │                            │ EXECUTING        │
├──────────────┴────────────────────────────┴──────────────────┤
│ LIVE EVENTS                                                  │
│ 12:04:32 UAV-03 communications degraded                      │
│ 12:04:35 UAV-03 packet loss exceeded threshold               │
└──────────────────────────────────────────────────────────────┘
```

---

# 55. Vehicle Marker Behavior

Markers should:

- update smoothly
- rotate using heading
- visually distinguish communications state
- display callsign on selection/hover
- show planned route
- show completed trail

Do not update position visually only when telemetry arrives.

Interpolate between known positions where appropriate.

---

# 56. Fleet Sidebar

Each entry:

```text
UAV-014

mission state
communications state
battery
```

Allow:

```text
sort by callsign
filter by status
show warnings first
search by callsign
```

---

# 57. Vehicle Details Panel

Display:

```text
UAV-014

MISSION

State             EXECUTING
Waypoint          7 / 13
Elapsed           00:18:42

FLIGHT

Altitude          121.4 m
Speed              18.2 m/s
Heading           224°

POWER

Battery            71.3%
Return threshold   25%

COMMUNICATIONS

State             HEALTHY
Latency             37 ms
Packet loss          1.3%
Last telemetry      120 ms

MESSAGING

Latest sequence    18,452
Missing                 3
Duplicates               1
Out of order             2
```

---

# 58. Failure Injection UI

Simulation only.

Example:

```text
SIMULATION CONTROLS

Vehicle
[ UAV-014 ▼ ]

Latency
[────────●──────] 300 ms

Packet Loss
[────●──────────] 10%

Jitter
[──●────────────] 50 ms

Failure
[ Communications Blackout ▼ ]

Duration
[ 15 seconds ]

[ INJECT ]
```

Never expose weaponized options.

---

# 59. Event Timeline

Example:

```text
14:32:14  INFO
UAV-04 reached waypoint 6

14:32:17  WARNING
UAV-03 communications degraded

14:32:21  CRITICAL
UAV-03 connection lost

14:32:39  INFO
UAV-03 communications recovering

14:32:42  INFO
UAV-03 communications restored
```

Filtering:

```text
vehicle
severity
event type
time range
```

Click event:

```text
select corresponding vehicle
```

During replay:

```text
jump playback to event timestamp
```

---

# 60. Replay System

Route:

```text
/runs/{run_id}/replay
```

Replay is based on persisted historical telemetry.

Controls:

```text
play
pause
seek

0.5x
1x
2x
5x
10x

jump to event
```

Timeline:

```text
──────────────●─────────────────────────
12:00       12:26                       12:52
```

For arbitrary playback time `t`:

```text
load telemetry immediately before t

load telemetry immediately after t

interpolate visual state
```

Do not rerun simulation logic.

Historical replay represents what was persisted during the original run.

---

# 61. Debrief Dashboard

Display:

```text
MISSION DEBRIEF

Duration                     41m 18s
Vehicles                         50
Task completion                 96%
Communication availability     98.7%
Warnings                         17
Critical incidents                2

SYSTEM

Telemetry throughput      XXXX msg/s
p50 latency                   XX ms
p95 latency                   XX ms
p99 latency                   XX ms

TASKS

Completed                        48
Incomplete                        2
```

All values must come from actual application data.

---

# 62. AI Mission Analyst

The AI is a **read-only analytical layer** over the mission database.

The model should not receive giant raw telemetry dumps.

Instead expose structured tools.

---

# 63. AI Provider Interface

Create an abstraction similar to:

```python
class MissionAnalystProvider(Protocol):
    async def analyze(
        self,
        run_id: UUID,
        user_message: str
    ) -> AnalystResponse:
        ...
```

Provider selection:

```text
AI_PROVIDER
```

Implement:

```text
gemini
mock
disabled
```

first.

Other providers may be added later.

---

# 64. AI Tools

## `get_run_summary`

Input:

```json
{
  "run_id": "uuid"
}
```

Returns:

```text
mission duration
vehicle count
completion
event counts
communications availability
latency statistics
```

---

## `get_vehicle_summary`

Input:

```json
{
  "run_id": "uuid",
  "vehicle_id": "uuid"
}
```

Returns:

```text
mission progress
battery result
communication result
completed waypoints
important incidents
```

---

## `get_vehicle_events`

Input:

```json
{
  "run_id": "uuid",
  "vehicle_id": "uuid",
  "start_ms": 100000,
  "end_ms": 200000
}
```

---

## `get_network_statistics`

Returns:

```text
latency
packet loss
disconnect duration
availability
duplicate count
missing sequences
```

---

## `get_mission_events`

Filters:

```text
vehicle_id
severity
event_type
start_ms
end_ms
```

---

## `get_vehicle_telemetry_range`

Return downsampled telemetry only.

Do not give the model tens of thousands of rows unless required.

---

# 65. AI System Prompt

Use approximately:

```text
You are Sentinel Mission Analyst.

You analyze completed simulated UAV mission data.

You may only make factual claims supported by information returned from
Sentinel's internal tools.

When answering:

1. Determine the minimum data required.
2. Call the appropriate Sentinel tools.
3. Compare timestamps, vehicle identifiers, states, and metrics carefully.
4. Distinguish direct observations from inference.
5. Cite supporting mission event IDs where available.
6. Do not invent unavailable data.
7. If the available data cannot answer the question, say so clearly.

You are strictly read-only.

You may not:

- issue vehicle commands
- modify missions
- modify waypoints
- alter simulation state
- initiate failures
- control vehicles
- provide weapon, targeting, strike, or autonomous engagement guidance

Your purpose is operational analysis, debugging, debriefing, and explanation
of simulated benign UAV missions.
```

---

# 66. AI Response Schema

Prefer structured output.

Example:

```json
{
  "answer": "string",
  "confidence": "high",
  "evidence": [
    {
      "event_id": "uuid",
      "vehicle_id": "uuid",
      "sim_time_ms": 123456
    }
  ],
  "limitations": []
}
```

Never render arbitrary model-generated HTML.

---

# 67. Evidence Deep Links

If the analyst says:

```text
UAV-03 lost communications at 14:32:21 [E-91822]
```

`E-91822` should be clickable.

Clicking should:

```text
open replay
select UAV-03
seek to corresponding simulation timestamp
highlight the event
```

This is a flagship feature.

---

# 68. AI Debrief

After completion generate structured sections:

```text
Mission Summary

Completion

Communications

Vehicle Incidents

System Performance

Key Events

Observations
```

Recommendations should stay focused on software/simulation configuration.

Do not allow tactical weapons recommendations.

---

# 69. AI Failure Handling

AI is non-critical.

If:

```text
quota exhausted

provider unavailable

network error

invalid response
```

Sentinel must still support:

```text
mission planning
simulation
live telemetry
replay
metrics
deterministic debrief statistics
```

UI message:

```text
Mission Analyst is temporarily unavailable.
Core simulation and replay functionality remain operational.
```

---

# 70. Mock AI Provider

Create:

```text
AI_PROVIDER=mock
```

Mock mode must be clearly identified.

It should not pretend to be live AI.

It may return deterministic analysis for the seeded demo scenario.

Useful for:

```text
offline development
automated tests
provider outages
portfolio demo stability
```

---

# 71. Public Demo Scenario

Seed a deterministic scenario:

# Angeles Forest Survey

Purpose:

Wildfire/environmental survey simulation.

Configuration:

```text
25 UAVs

baseline latency:
50 ms

baseline packet loss:
1%

mission duration:
approximately 8–10 simulated minutes
```

Preconfigured incidents:

```text
UAV-07
communications blackout

UAV-12
battery return threshold reached

UAV-18
elevated packet loss
```

The random seed must produce these consistently.

This gives recruiters a reliable demo.

---

# 72. System Metrics

Instrument at least:

```text
telemetry_messages_generated_total

telemetry_messages_received_total

telemetry_messages_duplicate_total

telemetry_messages_missing_total

telemetry_messages_out_of_order_total

websocket_connections_active

telemetry_end_to_end_latency_ms

event_processing_latency_ms

simulation_tick_duration_ms

simulation_vehicle_count

stream_consumer_lag

database_batch_write_duration_ms
```

---

# 73. Developer Diagnostics Panel

Display optionally:

```text
SYSTEM

Vehicles                 500
Generated rate         5,000 msg/sec
Persist rate           1,000 samples/sec

p50 latency               21 ms
p95 latency               63 ms
p99 latency              124 ms

WebSocket clients           4

Duplicates                 32
Missing                   111
```

Values shown above are examples only.

Do not hardcode fake results.

---

# 74. Performance Targets

These are goals, not claims.

## MVP

```text
100 UAVs
10 messages/sec/UAV
≈1,000 generated messages/sec
```

Goal:

```text
p95 live telemetry delivery < 250 ms locally
```

## Scale test

```text
500 UAVs
5,000 generated messages/sec
```

## Stretch

```text
1,000 UAVs
10,000 generated messages/sec
```

Only publish actual measured results.

---

# 75. Load Testing

Provide:

```text
scripts/load_test.py
```

CLI:

```text
python scripts/load_test.py \
  --vehicles 500 \
  --rate 10 \
  --duration 60
```

Output:

```text
messages generated
messages processed
messages persisted

errors

duplicates
missing

throughput

p50
p95
p99
```

---

# 76. Benchmarking

Provide:

```text
scripts/benchmark.py
```

Benchmark profiles:

```text
100 UAVs
250 UAVs
500 UAVs
1000 UAVs
```

Record:

```text
machine
CPU
RAM
OS
Docker version where relevant

vehicle count
telemetry rate
duration

messages generated
messages delivered
messages persisted

CPU usage
memory usage

p50
p95
p99

throughput
error rate
```

Save results to:

```text
benchmark-results/
```

Prefer machine-readable JSON plus README tables.

---

# 77. README Benchmark Disclosure

Always identify:

```text
test hardware

local/cloud environment

simulation settings
```

Example:

```text
Benchmark environment:
MacBook ...
16 GB RAM
Docker Desktop
local PostgreSQL
local Redis
```

Never imply local benchmarks were cloud-scale production tests.

---

# 78. Frontend State Management

Use:

```text
TanStack Query
```

for:

```text
server state
mission definitions
historical data
```

Use:

```text
Zustand
```

for:

```text
live telemetry state
selected vehicle
playback state
simulation UI state
```

Use local component state where possible.

Do not place the entire application into one global context.

---

# 79. Live Telemetry Store

Conceptually:

```typescript
Map<VehicleId, VehicleTelemetry>
```

On incoming data:

```text
validate schema

compare sequence

record duplicate/gap/out-of-order stats

update current vehicle state

retain only limited in-browser short-term history

render
```

Do not retain entire mission telemetry in browser memory.

---

# 80. UI Philosophy

Sentinel should resemble professional operations software.

Avoid:

- neon hacker styling
- video-game HUD design
- excessive animation
- military movie aesthetics

Prefer:

```text
high information density
clean typography
map-dominant layout
clear hierarchy
restrained design
professional control surfaces
obvious system status
```

Dark mode is acceptable.

---

# 81. Accessibility

Do not communicate state only through color.

Use combinations of:

```text
color
icon
text label
shape
```

Examples:

```text
HEALTHY
DEGRADED
STALE
DISCONNECTED
CRITICAL
```

Must remain understandable without color alone.

---

# 82. Reusable Frontend Components

Create components such as:

```text
MissionMap
VehicleMarker
VehicleTrail
WaypointMarker
RouteLayer

FleetSidebar
VehicleDetailsPanel

StatusBadge

TelemetryCard
MetricsPanel

EventTimeline

FailureInjectionPanel
SimulationControls

PlaybackControls

DebriefSummary
MissionAssistant
EvidenceLink

ConnectionStatus
```

---

# 83. Authentication

Do not prioritize authentication in early phases.

Public portfolio version should default to:

```text
DEMO_MODE=true
```

Recruiters should not have to create an account.

Later, if authentication is added:

```text
ADMIN
OPERATOR
VIEWER
```

But core project value comes first.

---

# 84. Public Demo Protection

Server-side limits:

```text
PUBLIC_DEMO=true

MAX_VEHICLES=50

MAX_MISSION_DURATION_MINUTES=15

MAX_RUNS_PER_SESSION=5

MAX_AI_QUESTIONS_PER_RUN=10

MAX_TELEMETRY_RATE_HZ=5
```

Do not rely only on frontend limits.

---

# 85. Environment Configuration

Example local:

```text
APP_ENV=development

DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379

AI_PROVIDER=gemini
GEMINI_API_KEY=...

PUBLIC_DEMO=false

SIM_MAX_VEHICLES=1000
DEFAULT_TELEMETRY_RATE_HZ=10
TELEMETRY_PERSIST_RATE_HZ=2
```

Cloud:

```text
APP_ENV=production

DATABASE_URL=<NEON_URL>
REDIS_URL=<RENDER_KEY_VALUE_URL>

AI_PROVIDER=gemini
GEMINI_API_KEY=<secret>

PUBLIC_DEMO=true

SIM_MAX_VEHICLES=50
DEFAULT_TELEMETRY_RATE_HZ=5
TELEMETRY_PERSIST_RATE_HZ=2
```

Never commit secrets.

`.env.example` must contain placeholders only.

---

# 86. Structured Logging

Backend logs should be structured.

Include:

```text
timestamp
level
service

mission_id
run_id
vehicle_id
event_id

message
```

where applicable.

Avoid random `print()` debugging in production code.

---

# 87. Error Handling

Never silently suppress unexpected exceptions.

Forbidden:

```python
try:
    ...
except Exception:
    pass
```

Errors must be:

```text
handled
logged
propagated
retried where appropriate
or converted into explicit domain/application errors
```

Database transactions must roll back safely.

WebSocket disconnects must clean up subscriptions.

Workers must tolerate restart.

---

# 88. Testing Philosophy

AI-generated code must not be trusted merely because it compiles.

Every major feature requires tests.

The test suite is a first-class part of Sentinel.

---

# 89. Simulator Unit Tests

Cover:

```text
vehicle moves toward waypoint

vehicle reaches waypoint

waypoint sequence advances

heading updates

altitude approaches target

battery decreases

low battery warning triggers

return threshold triggers RETURNING

vehicle completes mission

communication outage does not freeze simulation
```

---

# 90. State Machine Tests

Explicitly validate allowed transitions.

Example:

```text
READY → LAUNCHING       valid

LAUNCHING → TRANSIT     valid

TRANSIT → EXECUTING     valid

COMPLETE → LAUNCHING    invalid
```

---

# 91. Network Tests

Using fixed seeds:

```text
packet loss behavior is deterministic

latency stays within expected distribution

duplicate telemetry retains same sequence/event identity

disconnect duration is respected

recovery occurs

delayed messages arrive in expected simulated order
```

---

# 92. Event Processing Tests

Test:

```text
duplicate telemetry is ignored durably

out-of-order telemetry is recognized

sequence gaps are detected

invalid schema is rejected

worker retry does not double-write data

consumer restart remains safe
```

---

# 93. Database Tests

Use integration tests for:

```text
transaction rollback

idempotency uniqueness constraint

mission creation

run creation

telemetry batch insertion

event retrieval

replay queries
```

---

# 94. WebSocket Tests

Test:

```text
connect

subscribe

receive telemetry

receive events

disconnect

reconnect

restore subscription

invalid subscription rejected
```

---

# 95. Frontend Unit Tests

Vitest:

```text
status formatting

communications state rendering

telemetry reducers

sequence/gap processing

replay interpolation

time formatting

metrics formatting
```

---

# 96. End-to-End Golden Path

Playwright must cover:

```text
1. Open Sentinel.
2. Create mission.
3. Add UAV.
4. Add route/waypoints.
5. Save mission.
6. Start simulation.
7. Observe UAV moving.
8. Observe live telemetry.
9. Inject communications blackout.
10. Observe DEGRADED/STALE/DISCONNECTED behavior.
11. Observe recovery.
12. Complete mission.
13. Open replay.
14. Seek through mission.
15. Open debrief.
16. Ask AI about one seeded incident when AI testing is enabled.
```

---

# 97. AI Tests

Never rely on live AI API calls in normal CI.

Use mock provider.

Test:

```text
tool selection

tool argument validation

evidence link generation

unsupported question handling

missing-data behavior

read-only constraint

provider unavailable behavior
```

Live provider tests may be optional/manual.

---

# 98. CI/CD

GitHub Actions should run:

Backend:

```text
lint
type checks where configured
pytest
integration tests
```

Frontend:

```text
ESLint
TypeScript check
Vitest
Next.js production build
```

E2E:

```text
Playwright
```

No deployment should proceed from main while required tests fail.

---

# 99. Local Development

Goal:

```text
docker compose up -d
```

starts:

```text
PostgreSQL
Redis/Valkey
```

Then developer can run:

```text
frontend
backend
simulator
```

Provide convenience:

```text
make dev
make test
make lint
make benchmark
```

if practical.

README must contain exact commands.

---

# 100. Public Deployment

Recommended:

```text
Frontend:
Vercel

Backend:
Render Web Service

Database:
Neon PostgreSQL

Event infrastructure:
Render Key Value / Valkey

Map tiles:
OpenFreeMap

AI:
Gemini
```

The code must not be tightly coupled to those providers.

---

# 101. Backend Cold Start UX

Free backend infrastructure may occasionally be unavailable or need time to start.

Frontend must handle this gracefully.

Instead of appearing broken:

```text
Starting Sentinel simulation service...
```

Retry health endpoint with bounded backoff.

After failure threshold:

```text
Sentinel backend is temporarily unavailable.
Please retry.
```

---

# 102. Redis/Valkey Ephemeral Behavior

Never assume transient stream state survives restart.

Completed mission history must remain in PostgreSQL.

If transient infrastructure disappears mid-demo:

- detect connection loss,
- reconnect,
- restore application connections,
- do not corrupt durable history.

---

# 103. AI Quota Protection

Public demo:

```text
MAX_AI_QUESTIONS_PER_RUN
```

should be enforced.

Do not let bots generate unlimited model calls.

Rate limit AI endpoints.

If quota/provider fails:

```text
AI unavailable
```

Core product continues functioning.

---

# 104. Map Cost Protection

Use:

```text
MapLibre + OpenFreeMap
```

Do not introduce a required paid mapping service.

Keep map-provider configuration isolated.

---

# 105. Observability

Do not require a paid external observability platform.

Use:

```text
structured application logs
internal metrics
benchmark output
Render/Vercel provider logs where available
```

Optionally expose:

```text
/api/metrics
```

for developer diagnostics.

---

# 106. Future Enhancements

Only after the core system is successful.

Potential safe extensions:

```text
survey-area polygons

vehicle classes

communications range models

base stations

wind simulation

terrain effects

sensor coverage visualization

collision detection

multi-UAV task allocation

PX4 simulator adapter

MAVLink adapter

optional C++ simulation module
```

Do not implement these early.

---

# 107. Optional C++ Extension

If later desired for resume breadth:

Move only performance-critical simulation logic to:

```text
C++20
```

Possible architecture:

```text
FastAPI Backend
      │
      ▼
C++ Simulation Engine
      │
      ▼
vehicle state
```

Do this only if profiling demonstrates educational or performance value.

Do not rewrite the entire project simply for a C++ keyword.

---

# 108. AI-Assisted Development Strategy

AI coding tools should be used heavily for:

```text
React components
CRUD endpoints
Pydantic schemas
Zod schemas
SQLAlchemy models
migrations
test scaffolding
Docker configuration
GitHub Actions
styling
API clients
map interactions
seed scripts
documentation
refactoring
```

Human/project-owner judgment should remain strongest around:

```text
domain model

state machines

telemetry contracts

sequence semantics

idempotency

Redis Stream architecture

simulation clock

persistence strategy

replay semantics

failure semantics

benchmark methodology

AI tool boundaries

architecture tradeoffs
```

---

# 109. Coding-Agent Behavioral Rules

Before implementing any major feature:

1. Read the relevant files in `/docs`.
2. Explain the implementation plan.
3. List modules/files affected.
4. Identify schema/migration changes.
5. Identify API/event-contract changes.
6. Identify required tests.
7. Implement only the requested phase.
8. Run relevant tests.
9. Run type/lint/build checks.
10. Fix failures.
11. Update documentation.
12. Report completed work and remaining work.

Do not continue while required checks are failing.

---

# 110. Dependency Discipline

Do not add a library merely because it is convenient.

Before adding a significant dependency, consider:

```text
Does the standard library already solve it?

Does an existing dependency solve it?

Does this library materially reduce complexity?

Is it actively maintained?

Will it make deployment harder?
```

Avoid dependency sprawl.

---

# 111. Things You Must Not Do

Do not:

```text
create 20 microservices

introduce Kubernetes

introduce Terraform initially

require AWS

use Kafka and Redis simultaneously without demonstrated need

add RabbitMQ

add GraphQL without a concrete reason

build custom authentication

store mission history only in browser localStorage

replace PostgreSQL with in-memory dictionaries

make Redis the durable system of record

have AI control UAVs

hide failing tests

hardcode fake benchmark numbers

silently swallow exceptions

invent mission data for AI answers

place entire backend in one file
```

---

# 112. AGENTS.md

Create `/AGENTS.md` with approximately:

```text
# Sentinel Engineering Rules

Sentinel is a non-weaponized UAV mission simulation and fleet operations
platform.

## Architecture

- Backend is a modular monolith.
- PostgreSQL is the durable system of record.
- Redis/Valkey Streams handle transient telemetry/event processing.
- REST handles configuration and historical queries.
- WebSockets handle realtime browser updates.
- Domain logic must not live inside API handlers.
- Simulation logic must not depend on frontend implementation.
- Simulator must not synchronously depend on PostgreSQL writes.
- Every external event uses a versioned schema.
- Every telemetry message has event_id and vehicle sequence.
- Durable processing must be idempotent.
- Simulation runs store random seeds.
- Replays use persisted telemetry and do not rerun simulations.
- Use enums instead of free-form state strings.

## AI

- Sentinel AI is strictly read-only.
- AI retrieves mission information through explicit tools.
- AI cannot modify missions or control vehicles.
- AI factual claims must be grounded in tool results.
- Mission-event claims should expose supporting event IDs.

## Safety Scope

Supported simulated operations include:
- search and rescue
- wildfire monitoring
- environmental surveys
- infrastructure inspection
- mapping
- communications relay

Do not implement:
- weapon control
- targeting
- strike planning
- autonomous engagement
- firing solutions
- evasion capabilities

## Engineering

- Tests are required for non-trivial behavior.
- Do not suppress unexpected exceptions.
- Prefer small modules with clear responsibilities.
- Avoid unnecessary dependencies.
- Avoid premature microservices.
- Avoid premature optimization.
- Measure before optimizing.
- Database schema changes require migrations.
- Never commit secrets.
- Update documentation when architecture changes.
- Do not mark a task complete while required tests/builds fail.

## Python

- type hints
- Pydantic at system boundaries
- async only where useful
- pytest

## TypeScript

- strict mode
- avoid any
- validate external data
- separate server/client concerns

## Major Feature Workflow

1. Read specifications.
2. State plan.
3. Identify contracts.
4. Identify migrations.
5. Identify tests.
6. Implement.
7. Run tests.
8. Run checks.
9. Update docs.
```

---

# 113. Development Phases

Do not implement them simultaneously.

---

# Phase 0 — Specification

## Goal

Create authoritative documentation before production implementation.

Generate:

```text
docs/PRODUCT_SPEC.md
docs/ARCHITECTURE.md
docs/DOMAIN_MODEL.md
docs/DATABASE.md
docs/API.md
docs/EVENT_CONTRACTS.md
docs/SIMULATION.md
docs/REALTIME.md
docs/REPLAY.md
docs/UI_SPEC.md
docs/AI_ASSISTANT.md
docs/TEST_PLAN.md
docs/PERFORMANCE.md
docs/DEPLOYMENT.md
```

## Acceptance criteria

Documentation:

- agrees with this master specification,
- contains no architectural contradictions,
- identifies open questions,
- defines major contracts,
- defines boundaries between modules.

No production feature implementation yet.

---

# Phase 1 — Development Skeleton

Build:

```text
Next.js TypeScript frontend

FastAPI backend

PostgreSQL

Redis/Valkey

Docker Compose

environment configuration

health endpoint

Alembic

pytest

Vitest

GitHub Actions
```

## Acceptance criteria

```text
docker compose up starts PostgreSQL and Redis

frontend starts

backend starts

GET /api/health reports service status

backend can connect to PostgreSQL

backend can connect to Redis

backend tests pass

frontend tests pass

TypeScript check passes

Next.js production build passes

.env.example is complete

README development instructions work
```

Do not implement simulator yet.

---

# Phase 2 — Mission Planner

Build:

```text
Mission domain model

vehicle definitions

waypoints

network profiles

mission CRUD

MapLibre map

vehicle placement

waypoint placement

route visualization

mission persistence
```

## Acceptance criteria

A user can:

```text
create mission

add 3 UAVs

place multiple waypoints

assign routes

configure mission parameters

save

reload page

recover identical mission configuration
```

---

# Phase 3 — Simulation Engine

Build:

```text
simulation clock

seeded randomness

UAV state machine

kinematic movement

waypoint navigation

battery model

telemetry generation
```

No real-time frontend streaming required yet.

## Acceptance criteria

Given fixed mission and seed:

```text
UAVs follow routes

waypoints complete

battery changes

state transitions occur

mission completes

results reproduce across repeated runs
```

Tests required.

---

# Phase 4 — Real-Time Telemetry

Build:

```text
Redis/Valkey Streams

telemetry publishing

FastAPI WebSocket

live map

fleet sidebar

vehicle detail

live events
```

## Acceptance criteria

```text
Start simulation.

Browser connects.

Vehicle markers move in real time.

Telemetry values update.

Mission events appear.

Multiple vehicles can be selected.

WebSocket reconnect works.
```

This is the first major demo milestone.

---

# Phase 5 — Network Degradation & Failures

Build:

```text
latency

jitter

packet loss

duplicates

communication blackout

communications state machine

recovery

failure injection panel
```

## Acceptance criteria

Inject communications outage.

Observed sequence:

```text
HEALTHY
↓
DEGRADED or STALE
↓
DISCONNECTED
↓
RECOVERING
↓
HEALTHY
```

Vehicle continues its simulated mission while disconnected.

Duplicate/missing sequence statistics work.

---

# Phase 6 — Durable Persistence & Replay

Build:

```text
persistence worker

batched telemetry writes

mission event writes

telemetry downsampling

replay query API

replay UI

timeline

position interpolation
```

## Acceptance criteria

```text
complete simulation

stop application

restart application

historical mission still exists

open replay

play/pause

seek

change playback speed

jump to event
```

Replay must not rerun simulation.

---

# Phase 7 — Metrics & Benchmarking

Build:

```text
system metrics

mission metrics

latency measurements

throughput measurement

diagnostics UI

load test

benchmark script
```

## Acceptance criteria

Run:

```text
100 UAV benchmark

250 UAV benchmark

500 UAV benchmark
```

Generate:

```text
throughput

p50

p95

p99

error count

CPU/memory information where practical
```

Store results.

Do not optimize before baseline results exist.

---

# Phase 8 — AI Mission Analyst

Build:

```text
provider interface

Gemini provider

mock provider

read-only tools

assistant endpoint

debrief endpoint

structured output

evidence links

AI UI
```

## Acceptance criteria

Operator can ask:

```text
"Why didn't UAV-12 complete its mission?"
```

Model:

```text
uses tools

retrieves correct events

answers based on actual data

cites event IDs
```

Click evidence:

```text
opens corresponding replay timestamp
```

Provider outage does not break Sentinel.

---

# Phase 9 — Scale Optimization

Benchmark:

```text
100

250

500

1000 UAVs
```

Profile actual bottlenecks.

Potential measured optimizations:

```text
WebSocket batching

Redis pipelining

database batch inserts

telemetry downsampling

frontend position interpolation

frontend rendering optimization
```

Do not implement speculative optimizations without data.

---

# Phase 10 — Free Public Deployment

Deploy:

```text
frontend → Vercel

backend → Render

PostgreSQL → Neon

Redis-compatible transient service → Render Key Value / Valkey

map → OpenFreeMap

AI → Gemini
```

Enable:

```text
PUBLIC_DEMO=true
```

## Acceptance criteria

From an anonymous browser:

```text
open Sentinel

launch seeded demo

see moving UAVs

observe telemetry

inject permitted simulated failure

complete run

open replay

view metrics

use AI analyst if quota available
```

No paid infrastructure required.

---

# 114. Phase 10 Public Limits

Recommended:

```text
MAX_VEHICLES=50

TELEMETRY_RATE_HZ=5

MAX_MISSION_DURATION_MINUTES=15

MAX_RUNS_PER_SESSION=5

MAX_AI_QUESTIONS_PER_RUN=10
```

Add rate limiting where appropriate.

---

# 115. Portfolio Presentation

README should begin with:

```text
# Sentinel

Real-time UAV mission planning, fleet simulation, telemetry,
failure-injection, replay, and AI-assisted mission-analysis platform.
```

Then:

```text
Demo GIF/video

Architecture diagram

Feature summary

Technology stack

Quick start

Demo scenario

Engineering design

Failure handling

Testing

Benchmark methodology

Actual benchmark results

Deployment architecture
```

---

# 116. Architecture Diagram for README

Eventually include something equivalent to:

```text
                  Browser
                     │
                     ▼
              Next.js / React
                     │
             REST + WebSocket
                     │
                     ▼
                 FastAPI
            ┌────────┼────────┐
            ▼        ▼        ▼
         Mission   Replay     AI
         Service   Service  Analyst
            │        │
            └────┬───┘
                 ▼
             PostgreSQL
                 ▲
                 │
           Persistence
              Worker
                 ▲
                 │
           Redis/Valkey
             Streams
                 ▲
                 │
          Simulation Engine
                 │
       ┌─────────┼──────────┐
       ▼         ▼          ▼
    UAV-001   UAV-002    UAV-N
```

---

# 117. Resume Measurement Objectives

The project should eventually generate truthful metrics suitable for resume bullets.

Examples of measurements to collect:

```text
maximum tested UAV count

telemetry events/sec

p50 delivery latency

p95 delivery latency

p99 delivery latency

mission completion rate

communications availability

failure recovery time

number of automated tests

number of deterministic simulation scenarios
```

Do not optimize for impressive numbers at the expense of correctness.

Do not invent results.

---

# 118. Potential Future Resume Format

Do not use until actual results exist.

Example:

```text
Sentinel — UAV Mission Operations Platform
TypeScript, React, Python, FastAPI, PostgreSQL, Redis

• Built a real-time UAV mission-planning and fleet-simulation platform
  coordinating 500+ simulated autonomous vehicles through a map-based
  operator interface and streaming thousands of telemetry events per second.

• Engineered an event-driven telemetry pipeline with Redis Streams,
  WebSockets, sequence-based deduplication, and PostgreSQL persistence,
  sustaining <ACTUAL THROUGHPUT> at <ACTUAL P95 LATENCY> under load.

• Developed deterministic network degradation and fault-injection simulations
  for latency, packet loss, duplicate messages, and communications outages,
  with recovery monitoring and historical mission replay.

• Implemented a read-only tool-calling AI Mission Analyst that investigates
  telemetry and operational incidents and generates evidence-linked
  post-mission debriefs.
```

---

# 119. Coding-Agent Master Execution Instruction

You are now responsible for implementing Sentinel according to this specification.

Do not attempt the entire project.

Do not write production feature code yet.

Begin with:

# PHASE 0 ONLY

Your first response must provide:

1. Your understanding of the product.
2. Proposed repository structure.
3. Domain model.
4. Database schema.
5. REST API contract.
6. WebSocket protocol.
7. Event schemas.
8. Simulation architecture.
9. Frontend architecture.
10. Replay architecture.
11. AI architecture.
12. Testing strategy.
13. Local vs. cloud deployment strategy.
14. Performance-testing strategy.
15. Engineering risks.
16. Any contradictions or ambiguities you identify.

Then create the Phase 0 specification documents.

Do not proceed to Phase 1 automatically.

After Phase 0:

- summarize what was produced,
- identify unresolved questions,
- confirm all documentation is internally consistent,
- stop.

---

# 120. General Implementation Contract

For every future phase, follow this workflow:

```text
READ
↓
PLAN
↓
IDENTIFY CONTRACT CHANGES
↓
IDENTIFY TESTS
↓
IMPLEMENT
↓
TEST
↓
LINT / TYPE CHECK / BUILD
↓
FIX FAILURES
↓
UPDATE DOCUMENTATION
↓
REPORT RESULTS
↓
STOP
```

Never claim success without running the relevant checks.

Never invent test results.

Never invent benchmark results.

Never silently change architecture.

Never treat generated code as correct merely because it was generated.

The project owner is using AI as an implementation accelerator while retaining architectural and engineering ownership.

Build Sentinel accordingly.