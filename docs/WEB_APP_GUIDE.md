# Sentinel web application guide

This document is the implementation-facing map of the web application. It answers
what each screen owns, what each action changes, where the data comes from, and what
the user should expect when an action is unavailable.

## Application model

```text
Mission definition
  ├─ fleet assignments
  ├─ route points and waypoint behavior
  └─ preflight readiness
       ↓ creates
Run execution
  ├─ transient WebSocket telemetry
  ├─ durable metrics and events
  └─ persisted replay and debrief
```

A mission is reusable configuration. A run is one execution of that configuration.
Editing a mission does not rewrite a completed run. Replay and debrief read the run's
persisted data and never execute simulation logic again.

## Screen contract

| Route | Owns | Primary action | Action effect |
|---|---|---|---|
| `/` | Orientation and demo entry | **Launch seeded demo** | Creates or reconnects to the bounded seeded run and opens live operations. |
| `/missions` | Mission definitions | **New mission** | Creates a draft definition; it does not start a run. |
| `/missions/[id]/plan` | Fleet, route, and readiness | **Create run** | Creates a new run only when every preflight check passes. |
| `/runs/[id]/live` | Current execution | **Start/Pause/Resume/Stop run** | Sends the corresponding run lifecycle command. Fault injection creates an auditable simulated impairment. |
| `/runs/[id]/replay` | Historical evidence | **Play/Pause, seek, focus, event links** | Moves a presentation cursor through persisted samples; it never changes the run. |
| `/runs/[id]/debrief` | Measurements and analysis | **Generate debrief / Ask analyst** | Reads metrics or requests read-only analysis grounded in the run. |

Every run screen exposes the same three-view navigation: Live operations, Replay, and
Debrief. This prevents the user from needing browser history to move through the
operational loop.

## Action and persistence rules

| Control | Local or durable | Why it exists |
|---|---|---|
| Mission name editor | Draft until **Save mission name** | Prevents an accidental keystroke from changing the reusable definition. |
| Map click | Durable waypoint creation | The map is the fast placement surface; the server assigns sequence and identity. |
| Waypoint coordinate/form edits | Draft until **Save waypoint** | Supports precise edits without silently persisting partial input. |
| Add UAV | Durable mission mutation | A new simulated vehicle must be part of the definition before readiness can pass. |
| Create run | Creates a new durable run record | A run captures its own seed, lifecycle, telemetry, events, and replay. |
| Failure injection | Durable event plus simulator effect | The action is restricted to the safe failure taxonomy and remains auditable. |
| Replay controls | Local presentation state | Seeking and playback do not mutate telemetry or rerun the simulator. |
| Analyst question | Read-only request | The analyst may summarize and cite evidence but has no mutation or vehicle-control tool. |

The planner's readiness gate blocks a run when identity, saved configuration, fleet
membership, route coverage, or basemap context is incomplete. The disabled action's
title and the visible check detail identify the next operator action.

## Data and status vocabulary

- `DRAFT` means a reusable mission definition is still being prepared.
- `READY` means the definition or run can accept its next lifecycle action; it does
  not mean an aircraft is authorized or physically connected.
- `RUNNING`, `PAUSED`, `COMPLETED`, and `ABORTED` describe a run execution, not the
  reusable mission definition.
- `LIVE`, `RECONNECTING`, and `DISCONNECTED` describe the browser's WebSocket path.
  Durable metrics remain a separate source and can be temporarily unavailable while
  the transient stream is active.
- Warnings and critical events use text, borders, and symbols in addition to tone;
  state is never communicated by color alone.

## Component structure

Shared composition lives in:

- `components/app-shell.tsx` — global navigation and simulation-only context.
- `components/page-header.tsx` — breadcrumb, title, description, status, and actions.
- `components/run-navigation.tsx` — consistent Live/Replay/Debrief context switcher.
- `components/status-badge.tsx` — typed status vocabulary and non-color symbols.

Feature surfaces live in focused components:

- `mission-planner.tsx` — readiness, fleet roster, map placement, and waypoint editor.
- `live-operations.tsx` — WebSocket ingestion, fleet telemetry, diagnostics, controls,
  fault injection, and event filtering.
- `replay-viewer.tsx` plus `replay-map.tsx` — persisted cursor, event navigation, and
  historical map state.
- `debrief-dashboard.tsx` — metrics, integrity accounting, and Mission Analyst output.
- `overview-field.tsx` — decorative Three.js overview visualization with a CSS
  fallback when WebGL is unavailable.

## Visual decisions

The interface uses a monotone grayscale token system: near-black canvas, raised
charcoal surfaces, visible separators, white primary actions, and explicit symbols for
state. The map is filtered to grayscale so geographic context supports the console
hierarchy instead of becoming a second color system.

Three.js is intentionally limited to the overview screen. It communicates the project's
systems character without competing with the operational map, live telemetry, or
evidence. WebGL is progressive enhancement; the page remains legible and complete
without it.

## Deliberately absent from this web surface

The current UI does not claim to implement physical aircraft control, targeting,
weaponized payloads, survey-region authoring, route reordering, or cloud-scale
capacity. Those are outside Sentinel's safety and evidence boundary. If a future
feature is added, it must first receive a contract, state model, API definition, and
test path before it receives a button.
