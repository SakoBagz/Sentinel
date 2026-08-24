# Project walkthrough

Guided tour of Sentinel's core capabilities.

## Summary

Sentinel is a deterministic realtime telemetry platform: seeded simulation, unreliable delivery, durable history, fault injection, and replay-backed analysis in a benign UAV mission domain.

## Demo flow

1. **Launch seeded run** on the landing page → live ops with 25 UAVs (Angeles Forest).
2. Inject `COMMUNICATIONS_BLACKOUT` on a vehicle → motion continues, telemetry drops, integrity counters update, and the action is audited.
3. Stop the run → **Replay** seeks persisted samples (no re-simulation).
4. **Debrief** cites event IDs; follow links into replay timestamps.
5. Open the **Audit** panel: operator actions with subject, action, and timestamp.
6. Optional: review [`benchmark-results/SUMMARY.md`](../benchmark-results/SUMMARY.md).

## Design notes

**Communications blackout**

- `NetworkSimulator` schedules delivery; blackout windows drop or delay envelopes ([`simulator/sentinel_sim/network.py`](../simulator/sentinel_sim/network.py)).
- Vehicle kinematics keep ticking; the aircraft is not frozen to the radio.
- Live clients may miss transient WebSocket frames; the durable path records what was delivered with sequence gaps accounted in the run telemetry summary.
- Replay never re-invokes the simulator — it projects PostgreSQL history.

**Access control**

- Mutating REST and WebSocket subscribe require a signed demo JWT (`operator` role).
- `observer` tokens can read history, replay, and debrief but cannot inject faults or start/stop runs.
- Append-only `audit_events` record who did what.
- This is demo auth for local/hosted demos, not corporate SSO or multi-tenant ACL.

**Why Redis and PostgreSQL**

- Redis Streams = transient fan-out and reconnect buffer.
- PostgreSQL = system of record for replay, metrics, audit, and debrief evidence (ADR-002).

## Technical notes

| Topic | Detail |
| --- | --- |
| Physics fidelity | Kinematic navigation + documented battery model; not aerodynamics CFD. |
| Scale | Local in-process numbers are checked in; hosted demo profiles are intentionally capped. |
| Auth | Demo JWT + roles + audit; production deployments would use an organizational IdP. |
| Three.js | Homepage craft + telemetry-bound inspect panel; operational map is MapLibre. |
| Analysis | Mock provider by default; optional external provider; read-only tools only. |

## Safety boundary

No weapon control, targeting, strike planning, engagement, or evasion. Analysis cannot command vehicles or payloads.
