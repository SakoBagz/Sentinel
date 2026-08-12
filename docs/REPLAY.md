# Sentinel Replay Architecture

Status: Phase 0 design baseline  
Date: 2026-08-12

## Principle

Replay is a read-only view of persisted historical telemetry and mission events. It
does not rerun the simulation, reapply random failures, or depend on Redis surviving
the original run. The replay represents what was durably persisted, including any
configured telemetry downsampling.

## Data source

The replay service queries PostgreSQL using bounded time windows and pagination. It
loads telemetry immediately before and after a requested time to create a visual
state. Important mission events are full fidelity and are available for timeline
navigation.

The route is:

```text
/runs/{run_id}/replay
```

The API is `GET /api/runs/{run_id}/replay` with `start_ms`, `end_ms`, `vehicle_id`,
`limit`, `cursor`, and optional downsample parameters.

## Playback model

Controls:

- play and pause;
- seek on a mission timeline;
- speeds `0.5x`, `1x`, `2x`, `5x`, and `10x`;
- jump to an event.

For a playback time `t`, the client or replay service loads the nearest persisted
sample at or before `t` and the next sample after `t`, then uses the domain's
`interpolate_position()` behavior for smooth visual state. It must not invent
telemetry values for factual panels; interpolated values are presentation-only and
should be labeled if a distinction matters.

## Event navigation

Clicking a timeline event selects its vehicle, seeks to its `sim_time_ms`, and
highlights the event. AI evidence links use the same event ID and timestamp, opening
the replay at the corresponding location.

## Historical fidelity

Replay must survive an application restart and remain usable when Redis/Valkey has
been restarted. It must expose the actual stored telemetry sampling policy. If a run
was downsampled to 2 Hz, replay cannot claim to show every 10 Hz sample.

## Query and performance rules

- Never fetch millions of samples into one response.
- Use `(run_id, vehicle_id, sim_time_ms)` indexes for vehicle playback.
- Use `(run_id, sim_time_ms)` for timeline/event windows.
- Use server-side downsampling for large windows where practical.
- Keep the browser's active replay window bounded and evict old samples.
- Keep event filters by vehicle, severity, type, and time range.

## Replay acceptance criteria

After a run completes, stop and restart the application. The mission and historical
data must still exist. The user can open replay, play/pause, seek, change speed, and
jump to an event. The simulation engine must not be invoked by any replay action.

## Phase 0 questions

- Confirm whether interpolation is performed by the backend or browser; baseline is
  browser-side for visual state and server-side for data reduction.
- Define the downsample algorithm and whether it is uniform, latest-value, or
  event-aware.
- Decide whether replay includes an explicit marker for transient messages that were
  delivered live but not durably stored.

