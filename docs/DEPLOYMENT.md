# Sentinel Deployment Strategy

The supported JavaScript runtime is pinned to Node 22.x in `.nvmrc`, CI, and the
Dockerfiles. Node 24 is not the supported local runtime for this Next.js baseline.

Status: Phase 9/10 implementation baseline
Date: 2026-08-12

## Cost constraint

The complete project must be buildable, testable, publicly deployable, and maintainable
at zero recurring cost. No required paid cloud instance, database, map provider,
Redis service, domain, AI API, or observability platform may be introduced.

## Local engineering profile

Docker Compose starts PostgreSQL and Redis/Valkey. Developers then run the Next.js
frontend, FastAPI backend, and simulator locally or through a convenience command.
The target workflow is:

```text
docker compose up -d
make dev
```

The service names, ports, health checks, and volumes are defined in
`docker-compose.yml`. The host PostgreSQL port defaults to `55432` to avoid colliding
with an existing local PostgreSQL installation; the container still listens on `5432`.
Local mode defaults to `PUBLIC_DEMO=false`, up to 1,000 simulated vehicles,
10 Hz telemetry, and 2 Hz durable persistence.

## Public portfolio profile

The proposed zero-cost provider layout is:

| Component | Provider/profile |
|---|---|
| Frontend | Vercel Hobby |
| Backend | Render free web service |
| PostgreSQL | Neon free PostgreSQL |
| Transient events | Render Key Value / Valkey |
| Maps | MapLibre GL JS + OpenFreeMap |
| AI | Gemini Developer API free tier, with mock/disabled fallback |
| CI/CD | GitHub Actions |

Provider adapters and environment variables must make substitutions possible if free
tiers change. The system must not depend on an external paid service for its core
workflow.

## Environment configuration

`.env.example` will document placeholders only, including:

```text
APP_ENV=development
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
AI_PROVIDER=mock
GEMINI_API_KEY=
PUBLIC_DEMO=false
SIM_MAX_VEHICLES=1000
DEFAULT_TELEMETRY_RATE_HZ=10
TELEMETRY_PERSIST_RATE_HZ=2
MAX_MISSION_DURATION_MINUTES=15
MAX_RUNS_PER_SESSION=5
MAX_AI_QUESTIONS_PER_RUN=10
```

Production values are injected by the host. Secrets are never committed, logged, or
returned in health/errors.

## Public server-side limits

With `PUBLIC_DEMO=true`, enforce 50 vehicles, 15-minute maximum mission duration,
5 runs per session, 10 AI questions per run, and 5 Hz maximum telemetry. These limits
apply in the backend even if a client is modified.

Anonymous access is intentional for recruiter usability. The backend derives a bounded
session key from `X-Session-Id` or the forwarded client address and enforces the run
quota server-side. This is a lightweight demo guard, not an authentication system; a
production deployment should place a trusted proxy/session layer in front of it.

## Cold starts and dependency degradation

The frontend checks `/api/health` with bounded exponential backoff and displays a
starting state during free-tier cold starts. After the retry threshold it explains
that the backend is temporarily unavailable and offers retry.

Redis/Valkey restart behavior is explicitly ephemeral: reconnect streams and consumers,
restore application connections, and never assume transient state survived. Durable
mission history and replay remain available from PostgreSQL.

AI quota or provider failure displays an unavailable state while core simulation,
telemetry, replay, and metrics continue.

## CI/CD

GitHub Actions runs backend lint/type checks/pytest/integration tests, frontend
ESLint/TypeScript/Vitest/production build, and Playwright as configured by the test
plan. Deployment is blocked while required checks fail. Deployment configuration is
kept in `infrastructure/render/`, `infrastructure/vercel/`, and `infrastructure/docs/`
without introducing Kubernetes or Terraform initially.

## Observability

No paid observability service is required. Use structured application logs, internal
metrics, benchmark output, and provider logs from Render/Vercel where available.
Include timestamp, level, service, mission ID, run ID, vehicle ID, event ID, and
message where applicable.

## Retention

Public database storage is limited. Provide an explicit cleanup script that can keep
the seeded demo and recent runs, remove older telemetry-heavy runs, and retain
aggregate benchmark summaries. Automatic deletion is disabled for development data.

## Deployment acceptance criteria

From an anonymous browser, a user can open Sentinel, launch the seeded demo, see moving
vehicles and telemetry, inject an allowed failure, complete a run, open replay, view
metrics, and use AI when quota is available. No paid infrastructure is required.

## Implementation status

- Provider layouts are documented as portable configuration rather than required
  dependencies; free-tier availability must still be checked at deployment time.
- `scripts/seed_demo.py` creates the deterministic benign three-UAV scenario through
  the API, and `scripts/cleanup_runs.py` is dry-run by default for retention review.
- The API container runs Alembic before Uvicorn; local Compose and the Render Docker
  service therefore share the same migration-on-start behavior.
