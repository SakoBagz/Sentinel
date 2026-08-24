# Optional external hosting checklist

Sentinel’s primary path is local Docker Compose. Use this checklist only if you later
run the API and UI on external hosts. See `infrastructure/vercel/README.md` and
`infrastructure/render/render.yaml` for reference wiring. PostgreSQL and Redis/Valkey
URLs are injected as secrets and are never committed.

1. Apply Alembic migrations and verify `/api/health` reports both dependencies.
2. Set `PUBLIC_DEMO=true` if you want the bounded demo limits (50 vehicles, 5 Hz
   telemetry, 15-minute runs, five runs per session, ten analysis questions per run).
3. Run `scripts/seed_demo.py --start` once and retain its returned IDs.
4. Confirm WebSocket upgrade uses `wss://` and CORS is narrowed to the frontend origin.
5. Confirm `/api/metrics` contains no secrets and provider failures return an explicit
   unavailable state while replay and deterministic metrics remain usable.
6. Use `scripts/cleanup_runs.py` in dry-run mode before any retention deletion; only
   pass `--apply` after reviewing the exact count and preservation arguments.

Local development remains the source of truth:

```bash
docker compose up -d
make test
```
