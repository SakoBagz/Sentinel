# Sentinel product specification

Status: implementation baseline

## Product definition

Sentinel is a real-time mission-planning, UAV fleet simulation, telemetry-monitoring,
failure-injection, replay, performance-analysis, and operational-debrief platform. It
demonstrates software-systems engineering through a benign UAV operations domain; it
is not an aerodynamics or weapons system.

The primary user journey is:

1. Create or select a mission.
2. Add simulated UAVs, starting positions, routes, parameters, and network profiles.
3. Create and start a deterministic simulation run.
4. Observe live positions, telemetry, vehicle state, battery, communications health,
   warnings, and mission progress.
5. Inject an allowed simulated failure and observe degradation and recovery.
6. Complete and persist the run.
7. Replay the persisted run without rerunning the simulation.
8. Inspect operational and system metrics.
9. Generate a read-only operational summary grounded in persisted mission data.
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
evasion, stealth optimization, or autonomous pursuit of people. Operational analysis
is read-only and may retrieve, summarize, compare, and explain simulated data only.

## Product principles

- PostgreSQL is the durable source of truth.
- Redis/Valkey is transient event infrastructure.
- The simulation continues when communications are unavailable.
- Every run is reproducible from its mission configuration and random seed.
- Replays show persisted historical data and never rerun simulation logic.
- Important events are persisted at full fidelity; high-frequency telemetry may be
  downsampled.
- Hosted limits are enforced server-side and do not represent benchmark scale.
- Provider-specific integrations remain replaceable.

## Operating profiles

### Local engineering and benchmark mode

Docker Compose runs PostgreSQL, Redis/Valkey, FastAPI, Next.js, and the simulator.
The target profile supports 100–1,000+ vehicles, normally at 10 Hz telemetry, for
tests, profiling, and benchmark runs.

### Hosted profile

The hosted profile is intentionally bounded: up to 50 vehicles, 5 Hz telemetry,
15-minute maximum mission duration, 5 runs per session, and 10 analysis questions per
run. Scale results come from the local benchmark environment and are not implied by
hosted limits.

## Flagship seeded scenario

**Angeles Forest Survey** is a deterministic wildfire/environmental survey scenario:

- 25 UAVs
- approximately 50 ms baseline latency
- approximately 1% baseline packet loss
- approximately 8–10 simulated minutes
- a communications blackout for UAV-07
- a battery return-threshold event for UAV-12
- elevated packet loss for UAV-18

The seed and scenario definition make those incidents repeatable. The exact seed is
recorded with the run rather than hardcoded in the UI.

## Acceptance criteria

- **Skeleton:** local services start, health reports dependencies, tests and builds pass.
- **Planner:** a mission with three UAVs and multiple routes survives save/reload.
- **Simulation:** a fixed mission and seed reproduce routes, state transitions,
  battery behavior, and completion.
- **Realtime:** live markers, telemetry, events, selection, and reconnect work.
- **Failures:** communication state degrades, disconnects, recovers, and does not
  freeze vehicle simulation; sequence statistics remain correct.
- **Replay:** completed data survives restart and supports play, pause, seek, speed,
  and event jumps without rerunning.
- **Metrics:** benchmark profiles produce measured results rather than hardcoded claims.
- **Analysis:** read-only summaries use actual data and link persisted evidence;
  provider failure does not affect core operations.
- **Hosted run:** an anonymous user can launch the seeded scenario, observe it, inject a
  safe failure, replay it, and view metrics within server-side limits.

## Resolved contract baselines

1. **Mission vehicle membership.** `mission_vehicles` is the authoritative join table
   for mission-scoped vehicle assignments and waypoint references.
2. **Mission versus run status.** A mission is reusable; a run is one execution. The
   API exposes typed schemas for both lifecycles.
3. **Run-scoped vehicle IDs.** `run_vehicles.id` is used for telemetry and event
   references within a run; `vehicle_definition_id` points to the reusable definition.
4. **Telemetry event identity.** Durable telemetry stores `event_id` while retaining
   `(run_id, vehicle_id, sequence)` as the idempotency key.
5. **Stop semantics.** `POST /runs/{run_id}/stop` transitions an active run to
   `ABORTED`; normal completion remains simulator-driven.
6. **Simulation speed.** `simulation_speed` changes wall-clock scheduling while
   simulation time and seeded randomness remain deterministic.
7. **Analysis evidence.** Every evidence reference is validated against the requested
   run before it is returned.
8. **Event identifiers in the UI.** Database event UUIDs are canonical; short labels
   are presentation aliases only.
