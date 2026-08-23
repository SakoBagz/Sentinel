# AGENTS.md

## Cursor Cloud specific instructions

Sentinel is a single-product monorepo: a real-time UAV mission-operations simulator.
Components: `apps/api` (FastAPI modular monolith + in-process `simulator/` Python engine),
`apps/web` (Next.js 15 operator UI). Datastores are PostgreSQL and Redis. See `README.md`
and the `docs/` directory for product/architecture details, and the `Makefile` for the
canonical dev/test/lint/build commands.

### Environment specifics (non-obvious)

- Infra runs **natively**, not via Docker (Docker is not installed in this environment).
  PostgreSQL 16 and Redis are installed as system packages in the VM snapshot; the update
  script does NOT install or start them.
- Postgres listens on the **default port 5432**, not the `55432` used by `docker-compose.yml`.
  The DB role/database are `sentinel`/`sentinel` (password `sentinel`), created in the
  snapshot. `.env` therefore sets `DATABASE_URL=postgresql+asyncpg://sentinel:sentinel@localhost:5432/sentinel`.
- `.env` is git-ignored and lives in the snapshot at the repo root. `apps/api/app/config.py`
  loads it relative to the process CWD, so start the API from the repo root (`/workspace`).
  If `.env` is ever missing, recreate it from `.env.example` and change the DB port `55432` -> `5432`.
- Python console scripts (`uvicorn`, `alembic`, `ruff`, `pytest`) install to `~/.local/bin`,
  which may not be on `PATH`. Either add it to `PATH` or invoke via `python3 -m <tool>`.
- pip installs require `--break-system-packages` (PEP 668 externally-managed environment).

### Starting services each session (not in the update script)

Start infra if not already running, apply migrations, then run the two dev servers:

```bash
# Infra (native)
sudo pg_ctlcluster 16 main start        # PostgreSQL on :5432
sudo redis-server --daemonize yes        # Redis on :6379

# Migrations (the Docker entrypoint does this automatically; native must run it manually)
PYTHONPATH=apps/api python3 -m alembic -c apps/api/alembic.ini upgrade head

# API (run from repo root so .env loads); http://localhost:8000/api/health
PYTHONPATH=apps/api:simulator python3 -m uvicorn app.main:app --reload --app-dir apps/api

# Web; http://localhost:3000
npm run dev:web
```

Verify health with `curl http://localhost:8000/api/health` (expects
`postgres: ok`, `redis: ok`). Launch the seeded "Angeles Forest Survey" run from the
landing page ("Launch seeded run"), or `POST /api/demo/launch`.

### Known non-blocking behavior

- In `npm run dev:web`, Next.js shows a dev-only runtime overlay: "Missing `<html>` and
  `<body>` tags in the root layout." The root layout renders `<html>`/`<body>` inside the
  `AppShell` component, so Next cannot statically detect them. It is dismissable, does not
  affect functionality, and the production build (`npm run build`) succeeds.

### Lint / test / build

Commands live in the `Makefile` and root `package.json`. Backend needs
`PYTHONPATH=apps/api:simulator`. Web e2e (`npm --workspace apps/web run test:e2e`) requires
API + web running and a Playwright Chromium install (`npx playwright install --with-deps chromium`).
