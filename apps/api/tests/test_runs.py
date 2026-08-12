from uuid import UUID


def test_run_creation_and_deterministic_completion(client) -> None:
    mission = client.post("/api/missions", json={"name": "Run test"}).json()
    vehicle = client.post(
        f"/api/missions/{mission['id']}/vehicles",
        json={
            "callsign": "UAV-RUN",
            "starting_latitude": 34.15,
            "starting_longitude": -118.24,
            "starting_altitude_m": 100,
        },
    ).json()
    client.post(
        f"/api/missions/{mission['id']}/waypoints",
        json={
            "vehicle_id": vehicle["id"],
            "sequence": 0,
            "latitude": 34.1504,
            "longitude": -118.24,
            "altitude_m": 105,
            "arrival_radius_m": 5,
        },
    )

    created = client.post(f"/api/missions/{mission['id']}/runs", json={"random_seed": 1234})
    assert created.status_code == 201
    run = created.json()
    assert run["status"] == "READY"
    assert run["random_seed"] == 1234
    assert UUID(run["vehicles"][0]["id"])
    snapshot = client.get(f"/api/runs/{run['id']}/snapshot")
    assert snapshot.status_code == 200
    assert snapshot.json()["sim_time_ms"] == 0
    assert snapshot.json()["vehicles"][0]["telemetry"] is None

    started = client.post(f"/api/runs/{run['id']}/start")
    assert started.status_code == 200
    assert started.json()["status"] == "RUNNING"


def test_run_controls_pause_resume_and_stop_the_coordinator(client) -> None:
    mission = client.post("/api/missions", json={"name": "Control test"}).json()
    vehicle = client.post(
        f"/api/missions/{mission['id']}/vehicles",
        json={
            "callsign": "UAV-CONTROL",
            "starting_latitude": 34.15,
            "starting_longitude": -118.24,
            "starting_altitude_m": 100,
        },
    ).json()
    client.post(
        f"/api/missions/{mission['id']}/waypoints",
        json={
            "vehicle_id": vehicle["id"],
            "sequence": 0,
            "latitude": 34.5,
            "longitude": -118.24,
            "altitude_m": 100,
        },
    )
    run = client.post(f"/api/missions/{mission['id']}/runs", json={"simulation_speed": 0.1}).json()
    assert client.post(f"/api/runs/{run['id']}/start").json()["status"] == "RUNNING"
    assert client.post(f"/api/runs/{run['id']}/pause").json()["status"] == "PAUSED"
    assert client.post(f"/api/runs/{run['id']}/resume").json()["status"] == "RUNNING"
    assert client.post(f"/api/runs/{run['id']}/stop").json()["status"] == "ABORTED"
    event_types = {item["event_type"] for item in client.get(f"/api/runs/{run['id']}/events").json()["items"]}
    assert {"mission.started", "mission.paused", "mission.resumed", "mission.aborted"} <= event_types
