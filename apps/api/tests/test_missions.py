from uuid import UUID


def test_mission_vehicle_waypoint_golden_path(client) -> None:
    created = client.post(
        "/api/missions",
        json={
            "name": "Forest survey",
            "description": "A reusable benign survey mission",
            "scenario_type": "environmental_survey",
        },
    )
    assert created.status_code == 201
    mission = created.json()
    mission_id = mission["id"]
    assert mission["status"] == "DRAFT"

    vehicle_ids = []
    for number in range(1, 4):
        response = client.post(
            f"/api/missions/{mission_id}/vehicles",
            json={
                "callsign": f"UAV-{number:03d}",
                "vehicle_type": "SURVEY",
                "starting_latitude": 34.15,
                "starting_longitude": -118.24,
                "starting_altitude_m": 100,
            },
        )
        assert response.status_code == 201
        vehicle_ids.append(response.json()["id"])

    waypoint = client.post(
        f"/api/missions/{mission_id}/waypoints",
        json={
            "vehicle_id": vehicle_ids[0],
            "sequence": 0,
            "latitude": 34.151,
            "longitude": -118.241,
            "altitude_m": 120,
            "action": "SURVEY",
        },
    )
    assert waypoint.status_code == 201
    assert UUID(waypoint.json()["id"])

    reloaded = client.get(f"/api/missions/{mission_id}")
    assert reloaded.status_code == 200
    data = reloaded.json()
    assert len(data["vehicles"]) == 3
    assert data["vehicles"][0]["callsign"] == "UAV-001"
    assert data["waypoints"][0]["vehicle_id"] == vehicle_ids[0]


def test_duplicate_waypoint_sequence_is_rejected(client) -> None:
    mission = client.post("/api/missions", json={"name": "Duplicate test"}).json()
    vehicle = client.post(
        f"/api/missions/{mission['id']}/vehicles", json={"callsign": "UAV-DUP"}
    ).json()
    payload = {"vehicle_id": vehicle["id"], "sequence": 0, "latitude": 0, "longitude": 0, "altitude_m": 10}
    assert client.post(f"/api/missions/{mission['id']}/waypoints", json=payload).status_code == 201
    assert client.post(f"/api/missions/{mission['id']}/waypoints", json=payload).status_code == 409


def test_mission_list_cursor_is_stable_and_bounded(client) -> None:
    for index in range(3):
        assert client.post("/api/missions", json={"name": f"Cursor mission {index}"}).status_code == 201
    first = client.get("/api/missions?limit=1")
    assert first.status_code == 200
    assert len(first.json()["items"]) == 1
    assert first.json()["next_cursor"]
    second = client.get(f"/api/missions?limit=1&cursor={first.json()['next_cursor']}")
    assert second.status_code == 200
    assert len(second.json()["items"]) == 1
    assert second.json()["items"][0]["id"] != first.json()["items"][0]["id"]
