# Sentinel benchmark summary

These results are local measurements from the in-process simulator and sink; they are
not cloud capacity claims and do not include Redis, PostgreSQL, or browser delivery.

**Methodology:** `python3 scripts/benchmark.py --duration 3 --seed 42`  
**Measurement:** in-process `SimulationEngine` + idempotent sink  
**Date (UTC):** 2026-08-23  

| Vehicles | Generated | Delivered | Persisted | Throughput msg/s | Tick p95 ms | Errors |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 3000 | 3000 | 3000 | 26967.38 | 3.759 | 0 |
| 250 | 7500 | 7500 | 7500 | 27011.37 | 9.522 | 0 |
| 500 | 15000 | 15000 | 15000 | 26720.45 | 19.072 | 0 |
| 1000 | 30000 | 30000 | 30000 | 26728.03 | 38.084 | 0 |

Raw JSON: `inprocess-100uav.json`, `inprocess-250uav.json`, `inprocess-500uav.json`,
`inprocess-1000uav.json` (each includes OS/CPU/Python snapshot).
