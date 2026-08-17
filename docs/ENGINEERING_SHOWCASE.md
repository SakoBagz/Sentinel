# Sentinel engineering showcase

Sentinel is designed to be reviewed as a software-systems project that uses UAV
operations as its domain. The strongest demonstration is the complete operational
loop, not a static map:

```text
mission preflight → deterministic run → impaired telemetry → durable replay → evidence-grounded debrief
```

## One-minute reviewer walkthrough

1. Open the landing page and select **Launch seeded demo**.
2. In **Live operations**, point out the reconnectable WebSocket status, moving vehicle
   markers, failure injection, event severity filters, and **Operational diagnostics**.
3. Inject `COMMUNICATIONS_BLACKOUT` and observe that the simulator continues advancing
   while communications health changes independently.
4. Open replay and seek to an event. Explain that replay reads persisted telemetry and
   never reruns the simulator.
5. Open debrief and generate the mock Mission Analyst report. Follow an evidence link
   back to the exact event timestamp.
6. Return to the planner and show the **Mission readiness** gate: identity, fleet,
   route coverage, and basemap availability are explicit before launch.

## Engineering proof points

| Signal | Where to inspect it |
|---|---|
| Modular-monolith boundaries | `docs/ARCHITECTURE.md`, `apps/api/app/services/` |
| Deterministic simulation and seeded replay | `simulator/sentinel_sim/`, `docs/SIMULATION.md`, `docs/REPLAY.md` |
| Unreliable-network behavior | `simulator/sentinel_sim/network.py`, live failure controls |
| Durable vs. transient state | `apps/api/app/realtime/`, `docs/REALTIME.md` |
| Idempotent telemetry processing | `apps/api/app/realtime/persistence.py`, database constraints |
| Operator safety and preflight validation | `apps/web/lib/mission-readiness.ts`, planner UI |
| Measured system behavior | `apps/web/components/live-operations.tsx`, `scripts/benchmark.py` |
| Grounded, read-only AI | `apps/api/app/ai/`, `docs/AI_ASSISTANT.md` |
| Automated quality gates | `.github/workflows/ci.yml`, `docs/TEST_PLAN.md` |

## Resume language

Use measured numbers from `scripts/benchmark.py` only after running it on the hardware
and configuration you plan to disclose. Safe starting points for a resume are:

- Built a deterministic, event-driven UAV operations simulator with PostgreSQL as the
  system of record and Redis Streams for transient telemetry fan-out.
- Implemented reconnectable WebSocket telemetry, sequence-gap accounting, failure
  injection, idempotent persistence, and persisted replay with evidence-linked events.
- Added explicit mission preflight gates and live diagnostics for telemetry throughput,
  delivery latency, communications availability, and data-integrity counters.
- Designed a read-only Mission Analyst with validated tools and evidence references;
  mutation and vehicle-control capabilities are absent by construction.

Avoid claiming production scale, aerospace certification, or cloud capacity from the
local benchmark harness. State the vehicle count, telemetry rate, duration, machine,
and whether the result measured the in-process simulator or the full Compose stack.
