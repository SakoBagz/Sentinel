from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def test_websocket_subscribe_and_ping() -> None:
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws/runs/{uuid4()}") as websocket:
            ready = websocket.receive_json()
            assert ready["type"] == "connection.ready"
            websocket.send_json({"type": "subscribe", "topics": ["telemetry", "events"]})
            subscription = websocket.receive_json()
            assert subscription["type"] == "subscription.ready"
            assert subscription["data"]["topics"] == ["events", "telemetry"]
            websocket.send_json({"type": "ping"})
            assert websocket.receive_json()["type"] == "pong"


def test_websocket_rejects_unknown_topic() -> None:
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws/runs/{uuid4()}") as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "subscribe", "topics": ["unknown"]})
            response = websocket.receive_json()
            assert response["type"] == "subscription.error"

