# Sentinel Test Plan

Status: Phase 0 design baseline  
Date: 2026-08-12

## Testing principles

AI-generated code is not trusted because it compiles. Every non-trivial behavior gets
an automated test at the narrowest useful layer, with integration and end-to-end tests
for boundaries. Normal CI must be deterministic and must not require live AI calls or
paid infrastructure.

## Test layers

### Domain and simulator unit tests

Cover:

- vehicle movement toward a waypoint;
- arrival radius and waypoint sequence advancement;
- heading and altitude adjustment;
- battery drain, low, return, and critical thresholds;
- valid and invalid state transitions;
- vehicle and mission completion;
- outage does not freeze simulation;
- seeded repeatability.

### Network and event tests

Using fixed seeds, verify packet loss, latency/jitter bounds, duplicates, disconnect
duration, recovery, delayed delivery ordering, envelope validation, sequence gaps,
out-of-order detection, and centralized event/severity mapping.

### Backend integration tests

Run against PostgreSQL/Redis test services and cover mission/run creation, transaction
rollback, Alembic migrations, telemetry batch insertion, uniqueness/idempotency,
event retrieval, replay queries, Redis reconnect, consumer retry, and WebSocket
connect/subscribe/receive/disconnect/reconnect/subscription restoration.

### Frontend unit tests

Vitest covers status formatting, communications state rendering, telemetry reducers,
sequence/gap processing, replay interpolation, time formatting, metrics formatting,
and connection-state behavior.

### End-to-end golden path

Playwright covers:

1. Open Sentinel.
2. Create a mission.
3. Add a UAV.
4. Add a route and waypoints.
5. Save and reload the mission.
6. Start a simulation.
7. Observe movement and live telemetry.
8. Inject a communications blackout.
9. Observe degraded/stale/disconnected behavior.
10. Observe recovery.
11. Complete the run.
12. Open replay and seek.
13. Open debrief.
14. Ask the mock analyst about a seeded incident when AI testing is enabled.

## Contract tests

Pydantic and Zod schemas are tested with valid, invalid, unknown-version, malformed,
out-of-range, and cross-run identifier cases. REST and WebSocket fixtures must assert
that external payloads match `API.md`, `EVENT_CONTRACTS.md`, and `REALTIME.md`.

## AI tests

The mock provider is the default. Test that tools are read-only, run/vehicle arguments
are validated, evidence IDs come from the queried run, missing data is acknowledged,
unsupported safety questions are declined, malformed provider output is rejected, and
provider outage preserves core functionality.

## CI gates

GitHub Actions should run:

Backend:

- lint;
- type checks where configured;
- unit and integration pytest;
- migration/schema checks.

Frontend:

- ESLint;
- TypeScript strict check;
- Vitest;
- Next.js production build.

System:

- Playwright with local services or a controlled test stack.

Deployment cannot proceed from main while required checks fail. Tests must not be
hidden, skipped silently, or replaced with fabricated results.

## Fixtures and determinism

Use a minimal three-UAV mission fixture and the deterministic Angeles Forest scenario.
Store explicit seeds in fixtures and compare state/event traces rather than wall-clock
timestamps. Test databases and Redis streams are isolated per test run.

## Performance checks

Load tests are separate from ordinary CI and are described in `PERFORMANCE.md`.
Benchmark output is machine-readable and includes environment metadata. No performance
number is published until produced by the benchmark script.

## Phase 0 questions

- Select the exact Python lint/type-check tools during Phase 1 dependency review.
- Decide whether end-to-end CI runs Docker Compose services on every pull request or
  uses a reduced in-process test profile.
- Define minimum coverage thresholds after the first baseline suite exists.

