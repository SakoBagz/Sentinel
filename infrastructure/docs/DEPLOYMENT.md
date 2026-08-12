# Zero-cost deployment checklist

The portable baseline is a Dockerized FastAPI service plus a Next.js frontend. Render
can run the API from `infrastructure/render/render.yaml`; Vercel can build `apps/web`
using the variables in `infrastructure/vercel/README.md`. PostgreSQL and Redis/Valkey
URLs are injected as secrets and are never committed.

Before publishing a public demo:

1. Apply Alembic migrations and verify `/api/health` reports both dependencies.
2. Set `PUBLIC_DEMO=true`; this enforces 50 vehicles, 5 Hz telemetry, 15-minute runs,
   five runs per session, and ten analyst questions per run.
3. Run `scripts/seed_demo.py --start` once and retain its returned IDs.
4. Confirm WebSocket upgrade uses `wss://` and CORS is narrowed to the frontend origin.
5. Confirm `/api/metrics` contains no secrets and provider failures return an explicit
   unavailable state while replay and deterministic metrics remain usable.
6. Use `scripts/cleanup_runs.py` in dry-run mode before any retention deletion; only
   pass `--apply` after reviewing the exact count and preservation arguments.

The local path remains the source of truth for development:

```bash
docker compose up -d
make test
```
