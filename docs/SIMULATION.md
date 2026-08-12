# Sentinel Simulation Architecture

Status: Phase 0 design baseline  
Date: 2026-08-12

## Purpose

The simulator is a deterministic kinematic model for benign UAV operations. It is
not a realistic aerodynamics engine. Its value is in state transitions, event-driven
telemetry, network failure behavior, replayable history, and measurable throughput.

## Components

```text
SimulationEngine
 ├─ SimulationClock
 ├─ SeededRandom
 ├─ VehicleState collection
 ├─ Navigation / geospatial utilities
 ├─ BatteryModel
 ├─ NetworkSimulator
 ├─ FailureController
 ├─ TelemetryEmitter
 └─ EventEmitter
```

The engine depends on domain contracts and an output port. It does not import frontend
code, perform WebSocket operations, or synchronously write PostgreSQL records.

## Simulation clock

The local default is a 10 Hz tick and 10 Hz telemetry generation. Public demo mode
uses 5 Hz telemetry while tick rate remains independently configurable. The clock
tracks integer `sim_time_ms`, advances by the configured tick interval, and can run at
a wall-clock speed multiplier. Persistence frequency is independent of both.

The run stores `random_seed` and `simulation_speed`. Speed changes scheduling only; it
must not change simulation time steps or the sequence of seeded random draws.

## Tick algorithm

Each tick performs the following operations in order:

1. Advance the simulation clock.
2. Load each current vehicle state.
3. Determine the current waypoint.
4. Calculate bearing and distance to the target.
5. Move by speed × `dt`, clamped to the remaining distance.
6. Adjust heading toward the bearing.
7. Adjust altitude toward the target altitude.
8. Reduce battery using base consumption, speed component, and optional vehicle-type
   modifier.
9. Mark a waypoint reached when distance is at or below its arrival radius.
10. Evaluate explicit vehicle-state transitions.
11. Generate telemetry at the vehicle's configured rate.
12. Apply network impairment to generated messages.
13. Deliver messages whose simulated latency has elapsed.
14. Generate operational events for transitions, thresholds, failures, and errors.

The sequence of these operations is part of deterministic behavior and is tested.

## Geospatial utilities

The domain provides tested functions:

- `distance_between()` using Haversine distance;
- `bearing_between()` using initial bearing;
- `destination_point()` for movement along a bearing;
- `interpolate_position()` for visual/replay interpolation.

These are sufficient for local and regional simulation. Units are meters, meters per
second, degrees, and UTC timestamps where relevant.

## Navigation and waypoint arrival

Movement follows the current route in sequence. The default arrival radius is 10 m,
but each waypoint may override it. Arrival produces `vehicle.waypoint_reached`,
increments the route sequence, and applies the waypoint action. The final route may
transition the vehicle to `RETURNING`, then `LANDED`, then `COMPLETE`.

## Battery model

Battery is a readable percentage derived from:

```text
drain = base consumption + speed component + vehicle-type modifier
```

At or below 30%, emit `battery.low`. At or below the configured return threshold,
transition to `RETURNING`. At or below 5%, emit `battery.critical`. Thresholds are
configuration values and events are emitted once per threshold crossing per run
vehicle.

## Seeded determinism

Every stochastic decision receives the run-scoped seeded random source. This includes
packet loss, duplicates, latency/jitter samples, disconnect timing, battery anomalies,
and scheduled failure timing. Global uncontrolled randomness is forbidden in domain
logic.

Given the same mission snapshot, run configuration, and seed, the simulator must
reproduce state and event results within the documented limits of scheduling. Tests
compare deterministic state/event traces rather than wall-clock timestamps.

## Network impairment

Each run vehicle has a `NetworkProfile` with base latency, jitter, packet-loss rate,
duplicate rate, disconnect probability, and disconnect duration bounds. For each
generated message:

1. Evaluate current connection state.
2. Determine drop/duplicate behavior from the seeded source.
3. Sample latency and jitter.
4. Queue delivery at simulated time plus latency.
5. Deliver when the scheduled simulated time arrives.

The simulator continues state updates while messages are dropped or delayed. A
duplicate retains the same sequence and event identity. A delayed message may be
observed out of order by consumers and must exercise their sequence handling.

## Communications state

State thresholds are configuration values. Recent successful delivery and acceptable
network statistics yield `HEALTHY`; elevated impairment yields `DEGRADED`; stale data
crosses `STALE`; prolonged absence crosses `DISCONNECTED`; resumed delivery enters
`RECOVERING` before reconciliation and `HEALTHY`.

Communications state describes ground delivery and does not control vehicle motion.

## Failure injection

The simulation-only failure controller supports:

```text
COMMUNICATIONS_BLACKOUT
HIGH_LATENCY
PACKET_LOSS
GPS_QUALITY_DEGRADATION
BATTERY_ANOMALY
SENSOR_UNAVAILABLE
SERVICE_DELAY
```

Each active failure has a run, optional vehicle, start/end simulation time, type, and
validated configuration. Injection emits `failure.injected`; expiry or explicit clear
emits `failure.cleared`. No weaponized or targeting failure types are part of the
domain.

## Completion

A run completes when all participating vehicles reach their terminal route outcome or
when a configured mission duration ends under an explicit policy. The completion
policy must be chosen before Phase 3; the baseline is all vehicles terminal, with a
duration cap producing a normal result plus warnings rather than silently extending
the run.

## Simulation tests

Required tests include movement, waypoint arrival, heading/altitude convergence,
battery thresholds, valid/invalid state transitions, route completion, deterministic
repeated runs, deterministic network behavior, delayed delivery, duplicates, sequence
gaps, outage/recovery, and the invariant that communications loss does not freeze the
simulation.

## Phase 0 questions

- Confirm whether the run duration cap ends a run as `COMPLETED` with incomplete
  vehicles or `ABORTED`.
- Define the exact battery consumption units and default coefficients before Phase 3.
- Define whether `HOLD` has a duration or remains until an external action; MVP should
  use a finite configured hold duration.

