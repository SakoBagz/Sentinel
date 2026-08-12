from dataclasses import dataclass


@dataclass
class SimulationClock:
    tick_hz: float = 10.0
    sim_time_ms: int = 0
    tick_index: int = 0

    def __post_init__(self) -> None:
        if self.tick_hz <= 0:
            raise ValueError("tick_hz must be positive")
        self.tick_interval_ms = max(1, round(1000 / self.tick_hz))

    @property
    def dt_seconds(self) -> float:
        return self.tick_interval_ms / 1000.0

    def advance(self) -> int:
        self.tick_index += 1
        self.sim_time_ms += self.tick_interval_ms
        return self.sim_time_ms

