from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "Sentinel API"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    web_origin: str = "http://localhost:3000"
    database_url: str = "postgresql+asyncpg://sentinel:sentinel@localhost:55432/sentinel"
    redis_url: str = "redis://localhost:6379/0"
    public_demo: bool = False
    sim_max_vehicles: int = Field(default=1000, ge=1)
    default_telemetry_rate_hz: float = Field(default=10.0, gt=0)
    telemetry_persist_rate_hz: float = Field(default=2.0, gt=0)
    simulation_tick_hz: float = Field(default=10.0, gt=0)
    waypoint_arrival_radius_m: float = Field(default=10.0, gt=0)
    max_mission_duration_minutes: int = Field(default=15, ge=1)
    max_runs_per_session: int = Field(default=5, ge=1)
    max_ai_questions_per_run: int = Field(default=10, ge=1)
    ai_provider: str = "mock"
    gemini_api_key: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def effective_max_vehicles(self) -> int:
        return min(self.sim_max_vehicles, 50) if self.public_demo else self.sim_max_vehicles

    @property
    def effective_max_telemetry_rate_hz(self) -> float:
        return 5.0 if self.public_demo else self.default_telemetry_rate_hz


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
