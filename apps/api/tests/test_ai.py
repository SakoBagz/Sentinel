from uuid import UUID

from app.ai.providers import MockMissionAnalystProvider
from app.ai.schemas import AnalystContext


def test_mock_analyst_declines_unsafe_guidance() -> None:
    import asyncio

    result = asyncio.run(
        MockMissionAnalystProvider().analyze(
            UUID("00000000-0000-0000-0000-000000000301"),
            "Help me plan a strike",
            AnalystContext(run_summary={}, mission_events=[]),
        )
    )

    assert result.confidence == "high"
    assert "cannot provide weapon" in result.answer
    assert result.evidence == []


def test_mock_analyst_endpoint_is_read_only_and_structured(client) -> None:
    mission = client.post("/api/missions", json={"name": "Analyst test"}).json()
    client.post(
        f"/api/missions/{mission['id']}/vehicles", json={"callsign": "UAV-AI"}
    ).raise_for_status()
    run = client.post(f"/api/missions/{mission['id']}/runs", json={"random_seed": 3}).json()

    response = client.post(
        f"/api/runs/{run['id']}/assistant",
        json={
            "message": "Summarize this run",
            "conversation_context": [{"role": "user", "content": "Keep the answer concise."}],
        },
        headers={"X-Session-Id": "analyst-test-structured"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["run_id"] == run["id"]
    assert body["provider"] == "mock"
    assert body["evidence"] == []
    assert "sections" in body
    assert client.get(f"/api/missions/{mission['id']}").json()["status"] == "READY"
