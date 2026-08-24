# Sentinel runtime and environment notes

The supported JavaScript runtime is pinned to Node 22.x in `.nvmrc`, CI, and the
Dockerfiles. Node 24 is not the supported local runtime for this Next.js baseline.

## Local profile (primary)

Docker Compose starts PostgreSQL, Redis/Valkey, the FastAPI service, and the Next.js
application. The target workflow is:

```text
docker compose up -d --build
```

The host PostgreSQL port defaults to `55432` to avoid colliding with an existing local
installation; the container still listens on `5432`. Local mode defaults to a 10 Hz
simulation tick, per-vehicle telemetry configured at 10 Hz, and 2 Hz durable
persistence. These are configuration defaults, not an integrated capacity claim.

Sentinel is intended to be run and demonstrated locally. Optional notes for external
hosts remain under `infrastructure/` for reference only.

## Environment configuration

`.env.example` contains placeholders only. Runtime values come from the environment
or Compose. Secrets are never committed, logged, or returned in health/errors.

```text
APP_ENV=development
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
ANALYSIS_PROVIDER=mock
ANALYSIS_API_KEY=
AUTH_SECRET=replace-with-long-random-secret
PUBLIC_DEMO=false
SIM_MAX_VEHICLES=1000
DEFAULT_TELEMETRY_RATE_HZ=10
TELEMETRY_PERSIST_RATE_HZ=2
SIMULATION_TICK_HZ=10
PERSISTENCE_QUEUE_MAXSIZE=1000
MAX_MISSION_DURATION_MINUTES=15
MAX_RUNS_PER_SESSION=5
MAX_ANALYSIS_QUESTIONS_PER_RUN=10
```

## Server-side limits

With `PUBLIC_DEMO=true`, the backend enforces 50 vehicles, a 15-minute maximum
mission duration, 5 runs per session, 10 analysis questions per run, and 5 Hz maximum
telemetry. These limits remain effective if a client is modified.

Mutating REST endpoints and WebSocket subscribe require a signed demo JWT
(`operator` or `observer`). Public-demo run quotas key off the JWT subject stored in
`simulation_runs.session_key`. This is demo-grade security literacy—not a
replacement for corporate IdP, OIDC, or multi-tenant ACLs (see ADR-007).

## Cold starts and dependency degradation

The frontend checks `/api/health` with bounded backoff and presents a starting state
during a cold start. If the backend remains unavailable, the UI offers a clear retry
path instead of a blank or broken screen.

Redis/Valkey is intentionally transient: reconnect streams and consumers after a
restart, but never assume transient state survived. Durable mission history and replay
remain available from PostgreSQL.

Analysis-provider failure displays an unavailable state while core simulation,
telemetry, replay, and metrics continue.

## CI/CD

GitHub Actions runs migrations, backend and simulator tests, static checks, frontend
ESLint/TypeScript/Vitest/build, and Playwright against the built Compose stack.
Deployment is blocked while required checks fail. Deployment configuration lives in
`infrastructure/render/`, `infrastructure/vercel/`, and `infrastructure/docs/`.

## Observability and retention

Structured logs and the built-in metrics surface provide service, mission, run,
vehicle, event, and timing context without requiring a paid observability platform.

Hosted database storage, when used, is limited. `scripts/cleanup_runs.py` supports
dry-run retention review before older telemetry-heavy runs are removed. Automatic
deletion is disabled for development data.

## Acceptance (local)

From a browser against the local stack, a user can open Sentinel, launch the seeded
run, see moving vehicles and telemetry, inject an allowed failure, complete the run,
open replay, and view metrics. CI exercises this path against Compose.

## Implementation status

- The API container runs Alembic before Uvicorn, keeping local Compose startup aligned.
- `scripts/seed_demo.py` uses the same seeded-run endpoint as the landing page.
- `scripts/cleanup_runs.py` is dry-run by default for retention review.
- CI checks the migration chain on SQLite and exercises the browser golden path against
  a built Compose stack.
