from app.config import get_settings


def test_public_demo_enforces_vehicle_rate_and_run_limits(client) -> None:
    settings = get_settings()
    previous = (settings.public_demo, settings.sim_max_vehicles, settings.max_runs_per_session)
    settings.public_demo = True
    settings.sim_max_vehicles = 1
    settings.max_runs_per_session = 1
    try:
        mission = client.post("/api/missions", json={"name": "Public limits"}).json()
        vehicle = client.post(
            f"/api/missions/{mission['id']}/vehicles",
            json={"callsign": "UAV-LIMIT-1", "telemetry_rate_hz": 10},
        )
        assert vehicle.status_code == 409
        vehicle = client.post(
            f"/api/missions/{mission['id']}/vehicles",
            json={"callsign": "UAV-LIMIT-1", "telemetry_rate_hz": 5},
        )
        assert vehicle.status_code == 201
        waypoint = client.post(
            f"/api/missions/{mission['id']}/waypoints",
            json={"vehicle_id": vehicle.json()["id"], "sequence": 0, "latitude": 34.15, "longitude": -118.24, "altitude_m": 100},
        )
        assert waypoint.status_code == 201
        session_headers = {"X-Session-Id": "public-limit-test"}
        first = client.post(f"/api/missions/{mission['id']}/runs", json={}, headers=session_headers)
        assert first.status_code == 201
        second = client.post(f"/api/missions/{mission['id']}/runs", json={}, headers=session_headers)
        assert second.status_code == 409
    finally:
        settings.public_demo, settings.sim_max_vehicles, settings.max_runs_per_session = previous


def test_configured_simulation_tick_rejects_higher_vehicle_rate(client) -> None:
    settings = get_settings()
    previous = settings.simulation_tick_hz
    settings.simulation_tick_hz = 5
    try:
        mission = client.post("/api/missions", json={"name": "Tick rate limit"}).json()
        response = client.post(
            f"/api/missions/{mission['id']}/vehicles",
            json={"callsign": "UAV-TICK-LIMIT", "telemetry_rate_hz": 10},
        )
        assert response.status_code == 409
        assert "simulation tick rate" in response.json()["error"]["message"]
    finally:
        settings.simulation_tick_hz = previous
