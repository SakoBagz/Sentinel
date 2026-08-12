from fastapi.testclient import TestClient

from app.api import health
from app.main import app


async def _ok_postgres() -> str:
    return "ok"


async def _ok_redis() -> str:
    return "ok"


def test_health_reports_dependency_status(monkeypatch) -> None:
    monkeypatch.setattr(health, "_check_postgres", _ok_postgres)
    monkeypatch.setattr(health, "_check_redis", _ok_redis)

    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "api",
        "dependencies": {"postgres": "ok", "redis": "ok"},
    }


def test_health_reports_degraded_dependency(monkeypatch) -> None:
    monkeypatch.setattr(health, "_check_postgres", _ok_postgres)

    async def unavailable_redis() -> str:
        return "unavailable"

    monkeypatch.setattr(health, "_check_redis", unavailable_redis)

    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "degraded"
    assert response.json()["dependencies"]["redis"] == "unavailable"


def test_validation_errors_use_stable_envelope() -> None:
    with TestClient(app) as client:
        response = client.get("/api/missions/not-a-uuid")

    assert response.status_code == 422
    assert response.headers["x-request-id"]
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
