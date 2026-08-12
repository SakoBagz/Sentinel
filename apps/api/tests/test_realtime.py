import pytest
from uuid import uuid4

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


def _run_id(client: TestClient) -> str:
    mission = client.post("/api/missions", json={"name": "Realtime test"}).json()
    vehicle = client.post(f"/api/missions/{mission['id']}/vehicles", json={"callsign": "UAV-WS"}).json()
    client.post(f"/api/missions/{mission['id']}/waypoints", json={"vehicle_id": vehicle["id"], "sequence": 0, "latitude": 34.151, "longitude": -118.24, "altitude_m": 100})
    return client.post(f"/api/missions/{mission['id']}/runs", json={"random_seed": 1}).json()["id"]


def test_websocket_subscribe_and_ping(client) -> None:
    with client.websocket_connect(f"/ws/runs/{_run_id(client)}") as websocket:
        ready = websocket.receive_json()
        assert ready["type"] == "connection.ready"
        websocket.send_json({"type": "subscribe", "topics": ["telemetry", "events"]})
        subscription = websocket.receive_json()
        assert subscription["type"] == "subscription.ready"
        assert subscription["data"]["topics"] == ["events", "telemetry"]
        websocket.send_json({"type": "ping"})
        assert websocket.receive_json()["type"] == "pong"


def test_websocket_rejects_unknown_topic(client) -> None:
    with client.websocket_connect(f"/ws/runs/{_run_id(client)}") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "subscribe", "topics": ["unknown"]})
        response = websocket.receive_json()
        assert response["type"] == "subscription.error"


def test_websocket_rejects_unknown_run(client) -> None:
    with client.websocket_connect(f"/ws/runs/{uuid4()}") as websocket:
        with pytest.raises(WebSocketDisconnect) as error:
            websocket.receive_json()
    assert error.value.code == 4404
