# Sentinel Frontend and UI Specification

Status: Phase 14 implementation baseline
Date: 2026-08-12

## Product feel

Sentinel should feel like professional mission-operations software: map-dominant,
information-dense, restrained, legible, and explicit about system status. Avoid neon
hacker styling, game-like HUDs, excessive animation, and military movie aesthetics.
Dark mode is acceptable but must preserve contrast and hierarchy.

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing page and seeded demo entry |
| `/missions` | Mission list |
| `/missions/[id]/plan` | Mission planner |
| `/runs/[id]/live` | Live mission operations |
| `/runs/[id]/replay` | Historical replay |
| `/runs/[id]/debrief` | Metrics and AI analysis |

The landing page exposes a primary **Launch seeded demo** action. It starts or
reconnects to the canonical Angeles Forest Survey run and routes directly to live
operations; launch errors remain visible inline without losing the landing context.

## Mission planner

The planner has a fleet sidebar, central MapLibre map, mission-configuration panel,
and waypoint/route area. Users can create a mission, add/select UAVs, click to add
waypoints, drag to reposition them, edit/delete/reorder route points, configure
altitude/speed/return-battery/network profile, save, reload, and recover identical
configuration.

The map renders home/base positions, vehicle positions, waypoint markers, editable
route polylines, and later survey regions. The live map adds planned routes and bounded
completed trails. Map provider configuration is isolated from the mission domain.

## Live operations

The flagship live view contains:

- mission title, run status, and elapsed simulation time;
- fleet sidebar with callsign, mission state, communications state, battery, search,
  sorting, filtering, and warnings-first view;
- map with smooth vehicle markers, heading rotation, planned routes, completed trails,
  and selected/hovered callsigns;
- vehicle details panel with state, waypoint progress, elapsed time, flight, power,
  communications, latest sequence, missing, duplicate, and out-of-order counts;
- live event timeline with severity, vehicle, type, and time filters;
- connection indicator with `LIVE`, `RECONNECTING`, or `DISCONNECTED` text.

Vehicle position should interpolate between known telemetry points when appropriate;
visual smoothing must not rewrite factual telemetry values.

## Failure injection panel

Visible only for simulation controls. It allows selecting a run vehicle, latency,
packet loss, jitter, permitted failure type, and duration, then submitting an
injection. Options are restricted to the safe taxonomy in the API specification.
Every injection must be auditable in the event timeline.

## Replay

Replay uses the controls and event navigation defined in `REPLAY.md`: play, pause,
seek, playback speed, jump to event, selected vehicle, and timeline highlighting.

## Debrief

The debrief screen shows actual mission duration, vehicle count, completion,
communications availability, warning/critical counts, throughput, latency percentiles,
and task completion. The Mission Analyst panel shows structured answer, confidence,
limitations, and clickable evidence references.

## Component boundaries

Reusable components should include:

```text
MissionMap
VehicleMarker
VehicleTrail
WaypointMarker
RouteLayer
FleetSidebar
VehicleDetailsPanel
StatusBadge
TelemetryCard
MetricsPanel
EventTimeline
FailureInjectionPanel
SimulationControls
PlaybackControls
DebriefSummary
MissionAssistant
EvidenceLink
ConnectionStatus
```

Components receive typed props and do not reach directly into API clients or domain
repositories. Feature-level hooks compose server state and live state.

## State management

- TanStack Query: mission definitions, mutations, historical telemetry/events/metrics.
- Zustand: live telemetry map, selected vehicle, playback, simulation UI state, and
  connection status.
- Local component state: transient forms, open panels, and presentational controls.

The live store validates incoming data, compares sequence numbers, counts gaps,
duplicates, and out-of-order messages, updates current vehicle state, and retains
bounded short-term history only.

## Accessibility

Never communicate state through color alone. Use color with icon, text, shape, or
pattern. Explicitly label `HEALTHY`, `DEGRADED`, `STALE`, `DISCONNECTED`, and
`CRITICAL`. Keyboard navigation, focus states, readable contrast, and reduced-motion
behavior are part of acceptance checks.

## Loading and degradation UX

The frontend polls `/api/health` with bounded backoff during a free-tier cold start
and shows “Starting Sentinel simulation service…” rather than a blank/error screen.
After the retry threshold, it shows a clear temporary-unavailable message and keeps
historical/local UI context intact where possible.

AI provider failure is shown as “Mission Analyst is temporarily unavailable. Core
simulation and replay functionality remain operational.”

## Resolved interaction baselines

- Visual design tokens and typography use the restrained dark operations baseline already
  present in the landing, planner, live, replay, and debrief surfaces.
- Planner route edits are local until an explicit save action is submitted.
- Live reconnect state comes from `GET /api/runs/{run_id}/snapshot` before the
  WebSocket subscription is restored.
