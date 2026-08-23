from fastapi.testclient import TestClient

from app.main import app


def test_session_issue_and_me(client) -> None:
    response = client.post("/api/auth/session", json={"role": "operator"})
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "operator"
    assert body["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["role"] == "operator"


def test_mutating_requires_auth() -> None:
    with TestClient(app) as anonymous:
        response = anonymous.post("/api/missions", json={"name": "No auth"})
    assert response.status_code == 401


def test_observer_cannot_inject_failure(client, observer_token) -> None:
    mission = client.post("/api/missions", json={"name": "Auth mission"}).json()
    vehicle = client.post(
        f"/api/missions/{mission['id']}/vehicles",
        json={"callsign": "UAV-AUTH", "starting_latitude": 34.15, "starting_longitude": -118.24},
    ).json()
    client.post(
        f"/api/missions/{mission['id']}/waypoints",
        json={"vehicle_id": vehicle["id"], "sequence": 0, "latitude": 34.16, "longitude": -118.24, "altitude_m": 100},
    )
    run = client.post(f"/api/missions/{mission['id']}/runs", json={"random_seed": 7}).json()
    client.post(f"/api/runs/{run['id']}/start")
    forbidden = client.post(
        f"/api/runs/{run['id']}/failures",
        headers={"Authorization": f"Bearer {observer_token}"},
        json={"vehicle_id": run["vehicles"][0]["id"], "failure_type": "PACKET_LOSS", "duration_ms": 1000},
    )
    assert forbidden.status_code == 403


def test_audit_events_recorded_for_mission_create(client) -> None:
    mission = client.post("/api/missions", json={"name": "Audited"}).json()
    events = client.get(
        "/api/audit/events",
        params={"resource_type": "mission", "resource_id": mission["id"]},
    )
    assert events.status_code == 200
    actions = {item["action"] for item in events.json()}
    assert "mission.create" in actions
