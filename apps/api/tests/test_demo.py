def test_demo_launch_creates_the_seeded_run_and_is_idempotent(client, monkeypatch) -> None:
    # The TestClient uses an isolated SQLite dependency override while the global
    # coordinator is configured for the production session factory. Keep this route
    # test focused on the seeded API contract rather than that worker wiring.
    from app.realtime.runner import coordinator

    monkeypatch.setattr(coordinator, "is_active", lambda _run_id: True)
    unrelated = client.post(
        "/api/missions",
        json={"name": "Unrelated environmental survey", "scenario_type": "environmental_survey"},
    )
    assert unrelated.status_code == 201
    headers = {"X-Session-Id": "demo-browser"}
    first_response = client.post("/api/demo/launch", headers=headers)
    assert first_response.status_code == 200
    first = first_response.json()
    assert first["status"] == "RUNNING"
    assert len(first["vehicles"]) == 25

    mission = client.get(f"/api/missions/{first['mission_id']}").json()
    assert mission["name"] == "Angeles Forest Survey"
    assert mission["scenario_type"] == "angeles_forest_survey"
    assert len(mission["vehicles"]) == 25
    assert len(mission["waypoints"]) == 75

    second_response = client.post("/api/demo/launch", headers=headers)
    assert second_response.status_code == 200
    assert second_response.json()["id"] == first["id"]

    stopped = client.post(f"/api/runs/{first['id']}/stop")
    assert stopped.status_code == 200
    assert stopped.json()["status"] == "ABORTED"
