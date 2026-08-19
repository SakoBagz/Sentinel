# Architecture decisions

This log records choices that shape the current implementation. Each decision is
small enough to evaluate independently and concrete enough to guide future changes.

## ADR-001 — Use a modular monolith first

**Decision:** Keep the API, orchestration, persistence, and analysis modules in one
deployable FastAPI application.

**Reasoning:** The boundaries are explicit in code, but the early system benefits from
simple local startup, shared transactions, and fewer distributed failure modes. A
module can become a service later if measurements justify the operational cost.

## ADR-002 — Make PostgreSQL the historical authority

**Decision:** Persist completed telemetry, events, run configuration, and metrics in
PostgreSQL. Treat Redis/Valkey Streams as transient transport.

**Reasoning:** Replay and debrief need durable, queryable history after a restart or
stream outage. Keeping transport separate also makes simulator timing independent from
database write latency.

## ADR-003 — Snapshot definitions at run creation

**Decision:** A run stores its own vehicle, route, network, speed, and seed values.

**Reasoning:** Editing a reusable mission definition must not change the meaning of a
historical run. The snapshot provides a stable audit boundary and makes deterministic
reproduction possible.

## ADR-004 — Use versioned envelopes at every event boundary

**Decision:** Telemetry and operational events carry an event ID, schema version,
simulation time, and per-vehicle sequence where applicable.

**Reasoning:** Consumers can validate, deduplicate, detect gaps, and evolve separately.
The browser may lose transient messages, but durable processing retains a measurable
record of what arrived and what did not.

## ADR-005 — Make replay a read-only historical projection

**Decision:** Replay queries persisted samples and events; it never invokes the
simulator.

**Reasoning:** A replay should explain what happened, not create a new outcome. This
keeps historical evidence stable across code, seed, and network changes.

## ADR-006 — Prefer progressive enhancement for maps

**Decision:** MapLibre provides the geographic surface, while mission controls and
historical panels remain usable if map tiles or WebGL are unavailable.

**Reasoning:** Mapping improves operational context, but an external tile service or
GPU capability should not make the application unusable or obscure the underlying data.
