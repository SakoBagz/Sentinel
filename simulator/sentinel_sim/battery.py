from dataclasses import dataclass


@dataclass(frozen=True)
class BatteryModel:
    base_consumption_per_second: float = 0.04
    speed_consumption_factor: float = 0.0015
    vehicle_type_modifier: float = 1.0

    def drain_percent(self, speed_mps: float, dt_seconds: float) -> float:
        return (
            self.base_consumption_per_second + speed_mps * self.speed_consumption_factor
        ) * self.vehicle_type_modifier * dt_seconds

