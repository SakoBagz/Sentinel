# Sentinel Test Plan

Status: Phase 14 implementation baseline
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
event retrieval, replay queries, bounded reconnect snapshots, Redis reconnect, consumer
retry, and WebSocket connect/subscribe/receive/disconnect/reconnect/subscription
restoration plus unknown-run rejection.

### Frontend unit tests

Vitest covers status formatting, communications state rendering, telemetry reducers,
sequence/gap processing, replay interpolation, time formatting, metrics formatting,
and connection-state behavior.

### End-to-end golden path

Playwright covers the executable local acceptance path:

1. Open Sentinel and launch the seeded public demo.
2. Create a mission through the API fixture, add a UAV, verify an unrouted mission
   cannot start, verify that OpenFreeMap rendered geographic features (not only an
   empty canvas), and add a waypoint by clicking the planner map.
3. Enter the planner, create a run, and start the live simulation.
4. Observe the live vehicle surface and telemetry connection.
5. Inject an allowed failure and wait for persisted completion.
6. Open replay, verify historical samples span the full run, and verify an event
   link seeks and highlights its exact persisted timestamp.
7. Open debrief, generate the deterministic mock analysis, and verify its summary.

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

- migration upgrade/check;
- syntax/import static lint;
- type checks where configured;
- unit and integration pytest;
- migration/schema checks.

Frontend:

- ESLint;
- TypeScript strict check;
- Vitest;
- Next.js production build.

System:

- Playwright with the built Docker Compose acceptance stack, including the public
  seeded-demo and planner-to-debrief golden paths.

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

## Remaining test-plan hardening

- Python tests use pytest; strict frontend TypeScript, Vitest, ESLint, and the
  containerized production build are the current gates.
- End-to-end CI can use Docker Compose services or a controlled reduced profile; the
  local acceptance path uses the Compose stack.
- Coverage thresholds remain a CI policy decision and are not used to hide or skip
  functional tests.
