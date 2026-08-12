# Sentinel Domain Model

Status: Phase 0 design baseline  
Date: 2026-08-12

## Core terms

### Mission

A reusable definition of a benign UAV operation. It contains metadata, scenario
parameters, assigned vehicles, routes, waypoints, and default configuration. A mission
can be executed more than once.

### Simulation run

One execution of a mission. A run preserves the mission snapshot, configuration,
random seed, timestamps, results, events, and telemetry history.

### Vehicle definition

Static configuration: callsign, vehicle type, maximum/cruise speed, battery capacity,
telemetry rate, and extensible configuration.

### Run vehicle

The run-specific instance of a vehicle definition. It owns starting position,
network-profile assignment, run configuration, dynamic state, and run-scoped identity.

### Waypoint

A mission route point with sequence, location, altitude, target speed, arrival radius,
mission-scoped vehicle association (nullable for shared routes), and an allowed benign
action: `TRANSIT`, `HOLD`, `SURVEY`, or `RETURN`.

### Telemetry sample

A versioned observation of one run vehicle at a simulation time and sequence number.

### Mission event

A meaningful operational or system occurrence, such as a waypoint arrival,
communications transition, battery warning, or failure injection.

## Enumerations

### Mission status

The reusable mission definition lifecycle is `DRAFT`, `READY`, `RUNNING`, `PAUSED`,
`COMPLETED`, or `ABORTED`. The meaning of `RUNNING`, `PAUSED`, `COMPLETED`, and
`ABORTED` for a reusable definition is the status of its active or most recent run;
the exact API projection remains an open contract point.

### Run status

The execution lifecycle uses the same externally visible values where the master
specification defines them: `READY`, `RUNNING`, `PAUSED`, `COMPLETED`, and `ABORTED`.
An internal `CREATED`/unstarted representation may be needed for a persisted run, but
it must not be exposed as an arbitrary free-form status. Confirm whether `READY` is
the public pre-start value before Phase 1.

### Vehicle mission state

```text
IDLE → READY → LAUNCHING → TRANSIT → EXECUTING → RETURNING → LANDED → COMPLETE
```

`PAUSED` and `ABORTED` are explicit terminal/interruption states where applicable.
Invalid transitions fail explicitly. In particular, `COMPLETE → LAUNCHING` is invalid
inside one run.

### Communications state

`HEALTHY`, `DEGRADED`, `STALE`, `DISCONNECTED`, and `RECOVERING` are independent of
mission state. A communications outage never freezes vehicle simulation.

### Event severity

`INFO`, `WARNING`, and `CRITICAL`.

## Aggregate relationships

```text
Mission
 ├─ MissionVehicle* ──> VehicleDefinition
 │     └─ RunVehicle* ──> SimulationRun
 └─ Waypoint*

SimulationRun
 ├─ RunVehicle*
 ├─ TelemetrySample*
 ├─ MissionEvent*
 ├─ FailureInjection*
 └─ Debrief*
```

`MissionVehicle` is the proposed association omitted from the master's minimum table
list. It lets a mission own a fleet independent of route assignment. If not approved,
the schema must define another authoritative membership mechanism.

## State-machine rules

### Run and mission lifecycle

- A mission in `DRAFT` becomes `READY` only after required configuration validates.
- Starting a ready mission creates a run snapshot and moves the run to `RUNNING`.
- A running run may move to `PAUSED`, then back to `RUNNING`.
- A normal simulation completion moves the run to `COMPLETED`.
- An explicit stop/abort moves the run to `ABORTED`.
- A completed or aborted run is immutable except for derived debrief records.
- The reusable mission definition can be run again; a new run gets a new ID and seed.

### Vehicle state

- `IDLE → READY` after run initialization.
- `READY → LAUNCHING` when the run starts that vehicle.
- `LAUNCHING → TRANSIT` after launch.
- `TRANSIT → EXECUTING` when the vehicle reaches an executing waypoint.
- `EXECUTING → TRANSIT` for the next route point where appropriate.
- Any active state may move to `RETURNING` on the configured battery return threshold.
- `RETURNING → LANDED` at the base/home position.
- `LANDED → COMPLETE` when vehicle run work is finalized.
- `PAUSED` and `ABORTED` preserve the last dynamic state and stop normal progression.

### Communications state

The state is derived from recent delivery, latency/loss thresholds, and simulated
disconnect timers. A typical outage is:

```text
HEALTHY → DEGRADED or STALE → DISCONNECTED → RECOVERING → HEALTHY
```

Thresholds are configuration values. Recovery includes reconciliation of the latest
delivered state; it does not rewind simulation time.

## Domain invariants

- Latitude is in `[-90, 90]`; longitude is in `[-180, 180]`.
- Waypoint sequence is unique within a mission/vehicle route.
- Arrival radius is positive.
- Packet-loss, duplicate, and disconnect probabilities are in `[0, 100]` percent or
  `[0, 1]` probability, but one representation must be chosen consistently at the API
  boundary.
- `sequence` starts at zero and increases monotonically per run vehicle.
- A duplicate sequence has the same event identity/payload for a given generated
  message.
- Randomness comes only from the run-seeded random source.
- AI cannot invoke domain mutation commands.

## Boundary ownership

| Concern | Owner |
|---|---|
| Valid state transitions | Domain state machine |
| Route movement and geospatial math | Simulation/navigation domain |
| Battery behavior | Simulation/battery domain |
| Network impairment | Simulation/network domain |
| Envelope/schema validation | Contract layer at ingress/egress |
| Persistence and idempotency | Application + repository layer |
| REST/WebSocket transport | API/realtime adapters |
| Presentation interpolation | Web client |
| AI factual grounding | AI tools and provider adapter |
