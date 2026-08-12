# Sentinel Engineering Rules

Sentinel is a non-weaponized UAV mission simulation and fleet-operations platform.

## Architecture

- Backend is a modular monolith.
- PostgreSQL is the durable system of record.
- Redis/Valkey Streams handle transient telemetry and event processing.
- REST handles configuration and historical queries.
- WebSockets handle realtime browser updates.
- Domain logic must not live in API handlers.
- Simulation logic must not depend on frontend implementation.
- The simulator must not synchronously depend on PostgreSQL writes.
- Every external event uses a versioned schema.
- Every telemetry message has an `event_id` and a vehicle sequence.
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

Do not implement weapon control, targeting, strike planning, autonomous engagement,
firing solutions, or evasion capabilities.

## Engineering

- Tests are required for non-trivial behavior.
- Do not suppress unexpected exceptions.
- Prefer small modules with clear responsibilities.
- Avoid unnecessary dependencies and premature microservices.
- Measure before optimizing.
- Database schema changes require migrations.
- Never commit secrets.
- Update documentation when architecture changes.
- Do not mark a task complete while required tests or builds fail.

## Python

- Use type hints.
- Validate system boundaries with Pydantic.
- Use async only where it is useful.
- Use pytest for backend and simulator tests.

## TypeScript

- Use strict mode.
- Avoid `any`.
- Validate external data.
- Separate server and client concerns.

## Major Feature Workflow

1. Read the relevant specifications.
2. State the implementation plan.
3. Identify contract changes.
4. Identify migrations.
5. Identify tests.
6. Implement only the requested phase.
7. Run tests.
8. Run lint, type, and build checks.
9. Update documentation.
10. Report completed work and remaining work.

