# Sentinel

Sentinel is a non-weaponized, real-time UAV mission-planning and fleet-operations
simulation platform. It demonstrates deterministic simulation, event-driven
telemetry, unreliable-network behavior, durable replay, performance measurement, and
read-only AI mission analysis.

## Current implementation status

The repository is being implemented phase-by-phase from the master specification.
The authoritative design contracts are in [`docs/`](docs/), and engineering rules are
in [`AGENTS.md`](AGENTS.md). Mission planning, deterministic simulation, realtime
delivery, failure injection, durable replay, metrics, and local benchmark harnesses
are implemented, as is the provider-neutral read-only Mission Analyst with mock and
optional Gemini adapters; deployment hardening follows.

## Local development

Requirements: Docker, Python 3.11+ (3.12+ recommended), Node.js 22.x, and npm.

```bash
nvm use
cp .env.example .env
docker compose up -d postgres redis
python3 -m pip install -r apps/api/requirements.txt
npm install
PYTHONPATH=apps/api:simulator uvicorn app.main:app --reload --app-dir apps/api
```

In another terminal:

```bash
npm run dev:web
```

Open [http://localhost:3000](http://localhost:3000). The API health endpoint is
[http://localhost:8000/api/health](http://localhost:8000/api/health).

Convenience commands:

```bash
make infra
make test-api
make test-web
make typecheck
make build
PYTHONPATH=apps/api:simulator python3 scripts/load_test.py --vehicles 500 --rate 10 --duration 60
```

## Architecture

- Next.js App Router frontend
- FastAPI modular-monolith backend
- PostgreSQL durable system of record
- Redis/Valkey Streams for transient realtime events
- deterministic simulator with seeded randomness
- MapLibre + OpenFreeMap map integration
- provider-abstracted, read-only Mission Analyst

Local benchmark mode and public demo mode have separate server-side limits. Benchmark
numbers are only published after the benchmark script produces them on documented
hardware; no values in this repository are fabricated.

## Safety boundary

Sentinel supports benign search-and-rescue, wildfire monitoring, infrastructure
inspection, mapping, environmental survey, and communications-relay scenarios. It does
not implement weapon control, targeting, strike planning, autonomous engagement,
firing solutions, or evasion capabilities.
