from collections import defaultdict, deque
from threading import Lock
from typing import Any


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    ordered = sorted(values)
    rank = percentile * (len(ordered) - 1)
    lower = int(rank)
    upper = min(len(ordered) - 1, lower + 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (rank - lower)


class MetricsRegistry:
    """Small in-process counter/gauge/histogram registry.

    It intentionally has no external service dependency. Histograms keep a bounded
    recent sample window, which is enough for local diagnostics and benchmark runs
    without allowing an unbounded process-memory sink.
    """

    _counter_names = (
        "telemetry_messages_generated_total",
        "telemetry_messages_received_total",
        "telemetry_messages_persisted_total",
        "telemetry_messages_duplicate_total",
        "telemetry_messages_missing_total",
        "telemetry_messages_out_of_order_total",
        "persistence_errors_total",
        "realtime_publish_errors_total",
        "websocket_queue_drops_total",
    )
    _gauge_names = (
        "websocket_connections_active",
        "simulation_vehicle_count",
        "stream_consumer_lag",
        "persistence_queue_depth",
        "persistence_queue_high_water_mark",
    )
    _histogram_names = (
        "telemetry_modeled_network_latency_ms",
        "redis_publish_duration_ms",
        "persistence_backpressure_wait_ms",
        "event_processing_latency_ms",
        "simulation_tick_duration_ms",
        "database_batch_write_duration_ms",
    )

    def __init__(self, sample_limit: int = 10_000) -> None:
        self._lock = Lock()
        self._sample_limit = sample_limit
        self._counters: dict[str, float] = defaultdict(float)
        self._gauges: dict[str, float] = defaultdict(float)
        self._observations: dict[str, deque[float]] = {
            name: deque(maxlen=sample_limit) for name in self._histogram_names
        }
        for name in self._counter_names:
            self._counters[name] = 0.0
        for name in self._gauge_names:
            self._gauges[name] = 0.0

    def increment(self, name: str, amount: float = 1.0) -> None:
        with self._lock:
            self._counters[name] += amount

    def set_gauge(self, name: str, value: float) -> None:
        with self._lock:
            self._gauges[name] = value

    def observe(self, name: str, value: float) -> None:
        with self._lock:
            self._observations.setdefault(name, deque(maxlen=self._sample_limit)).append(float(value))

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            counters = dict(self._counters)
            gauges = dict(self._gauges)
            histograms = {
                name: {
                    "count": len(values),
                    "sum": sum(values),
                    "p50": _percentile(list(values), 0.50),
                    "p95": _percentile(list(values), 0.95),
                    "p99": _percentile(list(values), 0.99),
                }
                for name, values in self._observations.items()
            }
        return {"counters": counters, "gauges": gauges, "histograms": histograms}

    def prometheus_text(self) -> str:
        snapshot = self.snapshot()
        lines: list[str] = []
        for name, value in sorted(snapshot["counters"].items()):
            lines.extend((f"# TYPE {name} counter", f"{name} {value:g}"))
        for name, value in sorted(snapshot["gauges"].items()):
            lines.extend((f"# TYPE {name} gauge", f"{name} {value:g}"))
        for name, histogram in sorted(snapshot["histograms"].items()):
            lines.extend(
                (
                    f"# TYPE {name} summary",
                    f'{name}{{quantile="0.5"}} {histogram["p50"]:.6f}',
                    f'{name}{{quantile="0.95"}} {histogram["p95"]:.6f}',
                    f'{name}{{quantile="0.99"}} {histogram["p99"]:.6f}',
                    f"{name}_sum {histogram['sum']:.6f}",
                    f"{name}_count {histogram['count']}",
                )
            )
        return "\n".join(lines) + "\n"


metrics = MetricsRegistry()
