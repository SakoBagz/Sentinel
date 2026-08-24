# Contributing

Thanks for your interest in Sentinel.

## Local development

1. Follow the [Quick start](README.md#quick-start) in the root README.
2. Prefer split processes (`postgres`/`redis` via Compose, API and web separately) for day-to-day work.
3. Run `make test`, `npm run typecheck`, and `npm run lint` before opening a PR.

## Guidelines

- Keep the simulation domain **benign** (no weapons, targeting, or engagement features).
- Treat PostgreSQL as the system of record; Redis Streams remain transient.
- Replay and debrief must read persisted history only — never re-run the simulator to invent samples.
- Prefer typed contracts at API boundaries (Pydantic / Zod).
- Add or update tests alongside behavior changes.

## Questions

Open a GitHub issue with reproduction steps, expected behavior, and environment details.
