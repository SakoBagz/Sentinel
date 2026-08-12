# Sentinel Product Specification

Status: Phase 0 design baseline  
Date: 2026-08-12  
Source: Sentinel Master Engineering Specification & Coding-Agent Constitution

## Product definition

Sentinel is a real-time mission-planning, UAV fleet simulation, telemetry-monitoring,
failure-injection, replay, performance-analysis, and AI-assisted mission-debrief
platform. It demonstrates software-systems engineering using a benign UAV operations
domain; it is not an aerodynamics or weapons system.

The primary user journey is:

1. Create or select a mission.
2. Add simulated UAVs, starting positions, routes, parameters, and network profiles.
3. Start a deterministic simulation run.
4. Observe live positions, telemetry, vehicle state, battery, communications health,
   warnings, and mission progress.
5. Inject an allowed simulated failure and observe degradation and recovery.
6. Complete and persist the run.
7. Replay the persisted run without rerunning the simulation.
8. Inspect operational and system metrics.
9. Ask the read-only Mission Analyst questions grounded in mission data.
10. Follow evidence references into the corresponding event and replay timestamp.

## Supported scenarios

- Search and rescue
- Wildfire monitoring
- Infrastructure inspection
- Environmental surveying
- Mapping
- Disaster response
- Communications relay
- Scientific surveys
- Emergency logistics simulation

## Explicit safety boundary

Sentinel must not implement weapon control, target selection, strike planning,
autonomous engagement, firing solutions, weaponized payload control, defense-system
evasion, stealth optimization, or autonomous pursuit of people. The AI Mission Analyst
is read-only and may retrieve, summarize, compare, and explain simulated data only.

## Product principles

- PostgreSQL is the durable source of truth.
- Redis/Valkey is transient event infrastructure.
- The simulation continues when communications are unavailable.
- Every run is reproducible from its mission configuration and random seed.
- Replays show persisted historical data and never rerun simulation logic.
- Important events are persisted at full fidelity; high-frequency telemetry may be
  downsampled.
- Public cloud limits are enforced server-side and do not represent benchmark scale.
- Provider-specific integrations remain replaceable.

## Operating profiles

### Local engineering and benchmark mode

Docker Compose runs PostgreSQL, Redis/Valkey, FastAPI, Next.js, and the simulator.
The target profile supports 100–1,000+ vehicles, normally at 10 Hz telemetry, for
tests, profiling, and benchmark runs.

### Public portfolio demo mode

The demo is intentionally bounded: up to 50 vehicles, 5 Hz telemetry, 15-minute
maximum mission duration, 5 runs per session, and 10 AI questions per run. The UI
must disclose that cloud capacity is limited and that scale results come from the
local benchmark environment.

## Flagship seeded scenario

**Angeles Forest Survey** is a deterministic wildfire/environmental survey scenario:

- 25 UAVs
- approximately 50 ms baseline latency
- approximately 1% baseline packet loss
- approximately 8–10 simulated minutes
- a communications blackout for UAV-07
- a battery return-threshold event for UAV-12
- elevated packet loss for UAV-18

The seed and scenario definition must make those incidents repeatable. The exact
seed is an implementation fixture and must be recorded with the run rather than
hardcoded in the UI.

## Phase boundaries

The authoritative contracts in this directory are implemented incrementally on the
phase branches recorded in Git history. The current main branch includes the planner,
simulator, realtime telemetry, failures, persistence/replay, metrics, AI, runtime
controls, and deployment hardening; benchmark scale remains an explicit measurement
activity rather than a claim about the public demo.

## Acceptance criteria by product milestone

- **Skeleton:** local services start, health reports dependencies, tests and builds pass.
- **Planner:** a mission with three UAVs and multiple routes survives save/reload.
- **Simulation:** fixed mission plus seed reproduces routes, state transitions,
  battery, and completion.
- **Realtime:** live markers, telemetry, events, selection, and reconnect work.
- **Failures:** communication state degrades, disconnects, recovers, and does not
  freeze vehicle simulation; sequence statistics are correct.
- **Replay:** completed data survives restart and supports play, pause, seek, speed,
  and event jumps without rerunning.
- **Metrics:** 100/250/500-vehicle benchmarks produce actual measured results.
- **AI:** read-only tool calls answer from actual data and link evidence; provider
  failure does not affect core operations.
- **Public demo:** an anonymous user can launch the seeded scenario, observe it,
  inject a safe failure, replay it, view metrics, and use AI when quota allows.

## Phase 0 open questions and proposed baselines

These are contract decisions to confirm before Phase 1 implementation:

1. **Mission vehicle membership.** The master minimum table list has no explicit
   mission-to-vehicle join table. This baseline defines a `mission_vehicles` join
   table in the database design and uses its ID for mission-scoped waypoint/API
   references; it is the cleanest way to support a vehicle with no waypoint yet. If
   the owner rejects it, the schema must document an alternative before migrations
   are written.
2. **Mission versus run status.** Mission is reusable, while a run is one execution.
   This baseline treats `MissionStatus` as the reusable definition lifecycle and
   `RunStatus` as the execution lifecycle, while retaining the master's state values
   where applicable. The exact public response shape needs owner confirmation.
3. **Run-scoped vehicle IDs.** This baseline uses `run_vehicles.id` for telemetry,
   event, and API references within a run; `vehicle_definition_id` points to the
   reusable static definition. This prevents ambiguity across repeated runs.
4. **Telemetry event identity.** The envelope requires `event_id`, but the minimum
   telemetry table omits it. This baseline stores it in `telemetry_samples` in the
   next schema revision while retaining `(run_id, vehicle_id, sequence)` as the
   durable idempotency key.
5. **Stop semantics.** `POST /runs/{run_id}/stop` transitions an active run to
   `ABORTED`; normal completion remains simulator-driven. The coordinator observes the
   command and stops progression without overwriting the abort with completion.
6. **Simulation speed.** This baseline treats `simulation_speed` as a multiplier on
   wall-clock scheduling while simulation time remains deterministic. It must not
   alter the tick algorithm or seeded random sequence.
7. **AI network-statistics input.** Every AI tool, including `get_network_statistics`,
   must receive or derive a `run_id`; the master example omits it for that tool.
8. **Event identifiers in the UI.** Database event UUIDs are canonical. Short labels
   such as `E-91822` are presentation aliases, not alternate identities.
