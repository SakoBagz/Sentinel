# Optional external hosting notes

Sentinel is developed and demonstrated **locally** via Docker Compose (see the root
[README](../../README.md)). This folder documents an optional split if you later want
the Next.js UI on a Node host and the API elsewhere. It is not required to use the
project.

## Architecture (optional)

```text
Browser → Next.js UI host → FastAPI + simulator host
                              ↓
                         PostgreSQL + Redis
```

## Prerequisites

1. A host for the FastAPI container (`apps/api/Dockerfile`).
2. Managed or self-hosted PostgreSQL and Redis.
3. A Node host for `apps/web` (or keep the UI in Compose).

## API environment

```text
APP_ENV=production
PUBLIC_DEMO=true
WEB_ORIGIN=https://YOUR-UI-ORIGIN
AUTH_SECRET=<generate-a-long-random-secret>
DATABASE_URL=<postgres-connection-string>
REDIS_URL=<redis-connection-string>
ANALYSIS_PROVIDER=mock
```

Generate a secret locally:

```bash
openssl rand -hex 32
```

Health check path: `/api/health`.

`WEB_ORIGIN` must match the UI origin exactly (no trailing slash).

## Frontend environment

Build `apps/web` with:

```text
NEXT_PUBLIC_API_BASE_URL=https://YOUR-API-ORIGIN
NEXT_PUBLIC_WS_BASE_URL=wss://YOUR-API-ORIGIN
```

These are baked in at **build time**. Redeploy after changing them.

For same-origin local development, leave them empty and use the Next.js proxy
(see root README).

## Smoke test

1. Confirm UI loads.
2. **Launch seeded run** → map and telemetry update.
3. Inject a fault → audit panel shows `failure.inject`.
4. Complete the run → open **Replay** and **Debrief**.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| API calls fail / CORS errors | `WEB_ORIGIN` on the API must match the UI origin exactly. |
| WebSocket never connects | Use `wss://` (not `ws://`) in `NEXT_PUBLIC_WS_BASE_URL`. |
| Stale API URL after env change | Redeploy the UI (`NEXT_PUBLIC_*` vars are build-time). |
| Cold start on free hosts | First request after idle may take 30–60s; retry. |
| 401 on mutations | Browser auto-issues a demo JWT; ensure API `AUTH_SECRET` is set. |

## Limits

When `PUBLIC_DEMO=true`: 50 vehicles, 5 Hz telemetry, 5 runs per session.
See [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md).

Reference files: [`../render/render.yaml`](../render/render.yaml).
