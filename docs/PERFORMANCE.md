# Sentinel Performance and Benchmarking Plan

Status: Phase 0 design baseline  
Date: 2026-08-12

## Goals, not claims

These are target workloads and acceptance goals, not existing results:

| Profile | Workload | Goal |
|---|---|---|
| MVP | 100 UAVs × 10 messages/sec ≈ 1,000 generated msg/sec | local p95 live delivery < 250 ms |
| Scale | 500 UAVs × 10 messages/sec ≈ 5,000 generated msg/sec | measure actual throughput/latency |
| Stretch | 1,000 UAVs × 10 messages/sec ≈ 10,000 generated msg/sec | measure feasibility and bottleneck |

Public demo limits are intentionally lower and must not be presented as scale proof.

## Metrics

Instrument at least:

- `telemetry_messages_generated_total`;
- `telemetry_messages_received_total`;
- `telemetry_messages_duplicate_total`;
- `telemetry_messages_missing_total`;
- `telemetry_messages_out_of_order_total`;
- active WebSocket connections;
- end-to-end telemetry latency in milliseconds;
- event processing latency;
- simulation tick duration;
- simulation vehicle count;
- Redis/Valkey stream consumer lag;
- database batch-write duration.

The diagnostics UI may show these values, but it must never hardcode example numbers.

## Load-test interface

Provide `scripts/load_test.py` with a command such as:

```text
python scripts/load_test.py --vehicles 500 --rate 10 --duration 60
```

Output must include messages generated, processed, persisted, errors, duplicate and
missing counts, throughput, and p50/p95/p99 latency. It should include run ID and
configuration for traceability.

## Benchmark profiles

Provide `scripts/benchmark.py` for 100, 250, 500, and 1,000 vehicle profiles. Record:

- machine, CPU, RAM, OS, and Docker version where relevant;
- vehicle count, telemetry rate, duration, and seed;
- generated, delivered, persisted messages;
- CPU and memory usage where practical;
- p50, p95, p99;
- throughput and error rate.

Store JSON results plus a human-readable summary under `benchmark-results/`. The
directory must not be populated with invented results.

## Methodology

1. Start from a clean, documented local profile.
2. Record hardware and software versions.
3. Use a fixed seed for repeatability and also run a separate variance sample when
   measuring network randomness.
4. Warm up services before timed measurement.
5. Run enough duration to expose batching, consumer lag, and database effects.
6. Repeat each profile and report the actual run count.
7. Preserve raw JSON and summarize p50/p95/p99 with error counts.
8. Identify the bottleneck before optimizing.
9. Re-run the same profile after each measured optimization.

## Optimization order

Only after baseline measurements consider WebSocket batching, Redis pipelining,
database batch inserts, telemetry downsampling, frontend interpolation, or rendering
optimization. Each change requires a before/after benchmark and regression tests.

## Disclosure

README benchmark tables must state test hardware, local/cloud environment, simulation
settings, and whether the result measures local services or public infrastructure.
Local benchmark data must never be implied to be cloud production capacity.

## Phase 0 questions

- Choose the metrics library/aggregation implementation during Phase 7 design.
- Define latency start/end markers precisely (simulator emission to browser receipt is
  the proposed live metric).
- Decide whether CPU/memory collection is mandatory on macOS, Linux, and CI.

