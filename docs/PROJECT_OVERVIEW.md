# Project overview

Sentinel is a software systems project for planning, executing, observing, and
reviewing benign UAV operations in a controlled simulation environment.

## The operator workflow

### 1. Define

The mission catalog stores reusable definitions. A definition contains the scenario,
fleet assignments, vehicle parameters, route points, and readiness state. The planner
blocks run creation until the required configuration is valid.

### 2. Operate

A run snapshots the current definition and records its random seed. The live view
receives telemetry and events over a reconnectable WebSocket, shows current vehicle
state on a map, and exposes controlled simulated impairments for testing recovery and
observability behavior.

### 3. Review

After completion, the debrief surface reads durable metrics and integrity counters from
PostgreSQL. Replay uses persisted telemetry and event history, allowing an operator to
seek to an exact simulation time without starting the simulator again.

## Engineering proof points

| Concern | Implementation | Where to inspect it |
| --- | --- | --- |
| Deterministic execution | Seeded clock, random source, and immutable run snapshot | `simulator/sentinel_sim/`, `apps/api/app/services/run_service.py` |
| Domain boundaries | Explicit enums, Pydantic contracts, and service-owned state transitions | `apps/api/app/domain/`, `apps/api/app/api/`, `apps/api/app/services/` |
| Event delivery | Versioned envelopes, Redis/Valkey Streams, reconnectable WebSockets | `simulator/sentinel_sim/models.py`, `apps/api/app/realtime/` |
| Durable correctness | Idempotent inserts and sequence accounting | `apps/api/app/realtime/persistence.py`, `apps/api/app/db/` |
| Failure behavior | Bounded communication and service impairments | `simulator/sentinel_sim/network.py`, live operations controls |
| Historical fidelity | Paged queries, interpolation, event seeking, and replay-only reads | `apps/api/app/services/history_service.py`, `apps/web/components/replay-viewer.tsx` |
| Operational analysis | Read-only summaries with persisted event evidence | analysis service modules, `apps/web/components/debrief-dashboard.tsx` |
| Verification | Unit, integration, build, migration, and browser acceptance gates | `.github/workflows/ci.yml`, `apps/web/e2e/` |

## Suggested walkthrough

1. Start the Compose stack and open the overview page.
2. Launch the seeded run to see a complete live operations surface.
3. Open the mission catalog and inspect the definition/readiness model.
4. Create a route point on a mission planner map.
5. Start a run, watch telemetry and diagnostics, then inject a bounded failure.
6. Open replay and jump to a persisted event.
7. Open debrief to compare mission outcome, delivery performance, and integrity data.

## Design principles

- Configuration and historical queries use REST; transient updates use WebSockets.
- PostgreSQL is authoritative for completed mission history.
- The simulator advances independently of database write latency.
- Replays never rerun simulations or invent historical samples.
- All externally received payloads are validated at the boundary.
- Status values are controlled enums rather than free-form strings.
- Safety boundaries are represented in domain options, not only in interface copy.

## Scope

Supported simulated operations are search and rescue, wildfire monitoring,
environmental surveys, infrastructure inspection, mapping, and communications relay.
Weapon control, targeting, strike planning, autonomous engagement, firing solutions,
and evasion capabilities are outside the domain.
