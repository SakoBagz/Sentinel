# Operational analysis

The analysis surface is a read-only layer over a completed or active run. It retrieves
bounded summaries, event history, vehicle state, network statistics, and persisted
metrics, then returns structured text plus links to supporting event IDs.

## Contract

- Analysis can read mission and run data.
- Analysis cannot change a mission definition, create a run, start or stop a run,
  inject a failure, or control a vehicle.
- Every evidence reference must belong to the requested run.
- Responses include a confidence value and limitations when the available data is
  incomplete.
- Provider or quota failures degrade this surface only; live operations and replay
  remain available.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/runs/{run_id}/debrief` | Generate or retrieve a structured post-run summary |
| POST | `/api/runs/{run_id}/assistant` | Ask a bounded operational question about the run |

The request accepts a bounded message and optional conversation context. The response
contains the run ID, answer, confidence, limitations, structured sections, and
evidence references with event IDs and simulation times.

## Failure behavior

The analysis path is deliberately non-critical. Invalid provider output, unavailable
dependencies, quota limits, and malformed evidence become explicit API errors. The
core mission, live telemetry, metrics, and replay paths do not depend on a successful
analysis response.

## Verification

The backend tests cover structured output, evidence ownership, read-only behavior,
unsafe-domain refusal, bounded context, and unavailable-provider behavior. The browser
golden path verifies that the debrief can be generated after a completed run.
