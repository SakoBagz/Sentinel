from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class Evidence(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    event_id: UUID
    vehicle_id: UUID | None = None
    sim_time_ms: int = Field(ge=0)


class AnalystResult(BaseModel):
    run_id: UUID
    answer: str = Field(min_length=1, max_length=10_000)
    confidence: Literal["high", "medium", "low"]
    evidence: list[Evidence] = Field(default_factory=list, max_length=20)
    limitations: list[str] = Field(default_factory=list, max_length=20)
    provider: str
    model: str | None = None
    sections: dict[str, str] = Field(default_factory=dict)


class AnalystContext(BaseModel):
    """Bounded context passed to a provider after read-only tool retrieval."""

    run_summary: dict[str, Any]
    mission_events: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    vehicle_summaries: list[dict[str, Any]] = Field(default_factory=list, max_length=20)
    network_statistics: dict[str, Any] | None = None
