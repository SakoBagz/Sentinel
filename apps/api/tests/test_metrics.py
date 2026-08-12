from app.observability.metrics import MetricsRegistry


def test_metrics_registry_exports_counters_gauges_and_percentiles() -> None:
    registry = MetricsRegistry(sample_limit=4)
    registry.increment("telemetry_messages_generated_total", 3)
    registry.set_gauge("simulation_vehicle_count", 2)
    registry.observe("simulation_tick_duration_ms", 1)
    registry.observe("simulation_tick_duration_ms", 3)
    registry.observe("simulation_tick_duration_ms", 5)

    snapshot = registry.snapshot()
    text = registry.prometheus_text()

    assert snapshot["counters"]["telemetry_messages_generated_total"] == 3
    assert snapshot["gauges"]["simulation_vehicle_count"] == 2
    assert snapshot["histograms"]["simulation_tick_duration_ms"]["p95"] == 4.8
    assert "telemetry_messages_generated_total 3" in text
    assert 'simulation_tick_duration_ms{quantile="0.95"} 4.800000' in text


def test_metrics_endpoint_is_available(client) -> None:
    response = client.get("/api/metrics")

    assert response.status_code == 200
    assert "telemetry_messages_generated_total" in response.text
    assert response.headers["content-type"].startswith("text/plain")
