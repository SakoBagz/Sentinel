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
        session_headers = {"X-Session-Id": "public-limit-test"}
        first = client.post(f"/api/missions/{mission['id']}/runs", json={}, headers=session_headers)
        assert first.status_code == 201
        second = client.post(f"/api/missions/{mission['id']}/runs", json={}, headers=session_headers)
        assert second.status_code == 409
    finally:
        settings.public_demo, settings.sim_max_vehicles, settings.max_runs_per_session = previous
