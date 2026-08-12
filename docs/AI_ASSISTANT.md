# Sentinel AI Mission Analyst

Status: Phase 8 implementation baseline
Date: 2026-08-12

## Role and boundary

The Mission Analyst is a read-only analytical layer over mission data. It retrieves
telemetry, events, metrics, and summaries; compares vehicles; explains simulated
failures; and produces post-mission summaries. It cannot issue vehicle commands,
modify missions or waypoints, launch or reroute vehicles, initiate failures, or
provide weapon/targeting/strike/autonomous-engagement guidance.

AI is non-critical. Planning, simulation, realtime telemetry, replay, and deterministic
metrics continue if the provider is unavailable, over quota, returns invalid output,
or is disabled.

## Provider interface

The application depends on a provider port conceptually equivalent to:

```python
class MissionAnalystProvider(Protocol):
    async def analyze(self, run_id: UUID, user_message: str) -> AnalystResponse:
        ...
```

Provider selection is controlled by `AI_PROVIDER`. Initial values are `gemini`,
`mock`, and `disabled`; future values may include `openai`, `cloudflare`, or `local`.
Domain and tool logic must not be hardcoded to a vendor.

## Read-only tools

All tools require a validated run ID, either explicitly or through a tool context.
They return bounded, structured data rather than giant raw telemetry dumps.

### `get_run_summary`

Input: `run_id`. Returns mission duration, vehicle count, completion, event counts,
communications availability, and latency statistics.

### `get_vehicle_summary`

Input: `run_id`, `vehicle_id`. Returns mission progress, battery result,
communications result, completed waypoints, and important incidents.

### `get_vehicle_events`

Input: `run_id`, `vehicle_id`, optional `start_ms` and `end_ms`. Returns bounded event
records with IDs, timestamps, severity, type, and payload needed for explanation.

### `get_network_statistics`

Input: `run_id`, optional vehicle/time filters. Returns latency, packet loss,
disconnect duration, availability, duplicate count, missing sequences, and out-of-order
counts.

### `get_mission_events`

Input: `run_id`, optional vehicle, severity, event type, and time filters. Returns
bounded event records.

### `get_vehicle_telemetry_range`

Input: `run_id`, `vehicle_id`, time range, and bounded sampling hint. Returns
downsampled telemetry only.

Tool arguments are schema-validated, query read-only repositories, and are logged with
run/vehicle/request IDs. There are no mutation tools in the provider tool registry.

## System prompt boundary

The provider receives instructions equivalent to:

> You are Sentinel Mission Analyst. Analyze completed simulated UAV mission data.
> Make factual claims only from Sentinel internal tool results. Determine the minimum
> required data, call appropriate tools, compare timestamps and identifiers carefully,
> distinguish observation from inference, cite supporting mission event IDs, and state
> when data is insufficient. You are strictly read-only and may not issue commands,
> modify missions or waypoints, alter simulation state, initiate failures, control
> vehicles, or provide weapon, targeting, strike, or autonomous-engagement guidance.

The actual system prompt is versioned with the provider adapter and reviewed whenever
tool or safety boundaries change.

## Structured response

The API returns a validated object equivalent to:

```json
{
  "answer": "string",
  "confidence": "high",
  "evidence": [
    {
      "event_id": "uuid",
      "vehicle_id": "uuid",
      "sim_time_ms": 123456
    }
  ],
  "limitations": []
}
```

Confidence is a controlled enum such as `high`, `medium`, or `low`. Evidence IDs must
exist in the queried run. Arbitrary model-generated HTML is never rendered.

## Evidence deep links

Evidence references are clickable. Selecting one opens replay, selects the referenced
vehicle, seeks to `sim_time_ms`, and highlights the canonical event ID. UI short labels
are aliases only; UUIDs remain the source of truth.

## Structured debrief

On completion, the service can produce:

- Mission Summary
- Completion
- Communications
- Vehicle Incidents
- System Performance
- Key Events
- Observations

Recommendations, if any, stay focused on software and simulation configuration. They
must not become tactical or weapons guidance.

## Mock and disabled providers

`AI_PROVIDER=mock` returns deterministic, clearly labeled responses for offline
development, tests, and seeded-demo stability. It must not pretend to be live AI.
`AI_PROVIDER=disabled` returns an explicit unavailable response without a network call.

The current implementation provides `mock`, `disabled`, and an optional Gemini HTTP
adapter behind the provider port. The mock provider is the CI/default path. Evidence
returned by a provider is checked against event IDs retrieved for the requested run
before it reaches the API response. A bounded in-process session/run quota and a
one-request-per-second guard protect public/demo usage; both are server-side.

## Provider failure handling

Quota exhaustion, network errors, provider outages, malformed structured output, and
tool failures are logged and converted into explicit API errors or unavailable states.
The core application remains operational. Public demo enforces
`MAX_AI_QUESTIONS_PER_RUN` and endpoint rate limits server-side.

## AI tests

Normal CI uses the mock provider. Tests cover tool selection, argument validation,
evidence generation, unsupported questions, missing data, read-only constraints,
structured-output validation, and provider-unavailable behavior. Live provider tests
are manual or separately gated and never required for ordinary CI.

## Phase 0 questions

- Confirm the Gemini SDK and structured-output mode during Phase 8 dependency review.
- Define the exact quota/rate-limit storage mechanism for anonymous public sessions.
- Decide whether generated debriefs are cached/reused by run and prompt version.
