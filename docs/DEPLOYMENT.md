# Sentinel deployment strategy

The supported JavaScript runtime is pinned to Node 22.x in `.nvmrc`, CI, and the
Dockerfiles. Node 24 is not the supported local runtime for this Next.js baseline.

## Local profile

Docker Compose starts PostgreSQL, Redis/Valkey, the FastAPI service, and the Next.js
application. The target workflow is:

```text
docker compose up -d --build
```

The host PostgreSQL port defaults to `55432` to avoid colliding with an existing local
installation; the container still listens on `5432`. Local mode defaults to up to
1,000 simulated vehicles, 10 Hz telemetry, and 2 Hz durable persistence.

## Hosted profile

The reference zero-cost layout is:

| Component | Provider/profile |
| --- | --- |
| Frontend | Vercel Hobby or equivalent Node host |
| Backend | Render free web service or equivalent container host |
| PostgreSQL | Managed PostgreSQL free tier |
| Transient events | Managed Redis/Valkey free tier |
| Maps | MapLibre GL JS + OpenFreeMap |
| CI/CD | GitHub Actions |

Provider adapters and environment variables keep substitutions possible if free tiers
change. The core workflow must not depend on one paid service.

## Environment configuration

`.env.example` contains placeholders only. Production values are injected by the host.
Secrets are never committed, logged, or returned in health/errors.

```text
APP_ENV=development
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
ANALYSIS_PROVIDER=mock
ANALYSIS_API_KEY=
PUBLIC_DEMO=false
SIM_MAX_VEHICLES=1000
DEFAULT_TELEMETRY_RATE_HZ=10
TELEMETRY_PERSIST_RATE_HZ=2
MAX_MISSION_DURATION_MINUTES=15
MAX_RUNS_PER_SESSION=5
MAX_ANALYSIS_QUESTIONS_PER_RUN=10
```

## Server-side limits

With `PUBLIC_DEMO=true`, the backend enforces 50 vehicles, a 15-minute maximum
mission duration, 5 runs per session, 10 analysis questions per run, and 5 Hz maximum
telemetry. These limits remain effective if a client is modified.

Anonymous access uses a bounded session key from `X-Session-Id` or the forwarded client
address. This is a lightweight hosted guard, not an authentication system; a
production deployment should place a trusted proxy/session layer in front of it.

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

Hosted database storage is limited. `scripts/cleanup_runs.py` supports dry-run
retention review before older telemetry-heavy runs are removed. Automatic deletion is
disabled for development data.

## Deployment acceptance

From an anonymous browser, a user can open Sentinel, launch the seeded run, see moving
vehicles and telemetry, inject an allowed failure, complete the run, open replay, and
view metrics. CI exercises this path before deployment.

## Implementation status

- The API container runs Alembic before Uvicorn, keeping local Compose and hosted
  container startup behavior aligned.
- `scripts/seed_demo.py` uses the same seeded-run endpoint as the landing page.
- `scripts/cleanup_runs.py` is dry-run by default for retention review.
- CI checks the migration chain on SQLite and exercises the browser golden path against
  a built Compose stack.
