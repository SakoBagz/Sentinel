from dataclasses import dataclass


@dataclass(frozen=True)
class BatteryModel:
    """Documented kinematic energy model — not aerodynamics or chemistry fidelity."""

    base_consumption_per_second: float = 0.04
    speed_consumption_factor: float = 0.0015
    vehicle_type_modifier: float = 1.0
    # Soft thermal-style uplift once speed approaches cruise/max ratio
    high_speed_thermal_factor: float = 0.35

    def drain_percent(self, speed_mps: float, dt_seconds: float, *, cruise_speed_mps: float = 18.0) -> float:
        cruise = max(cruise_speed_mps, 1e-6)
        speed_ratio = max(0.0, speed_mps) / cruise
        thermal = 1.0 + self.high_speed_thermal_factor * max(0.0, speed_ratio - 0.85)
        return (
            self.base_consumption_per_second + speed_mps * self.speed_consumption_factor
        ) * self.vehicle_type_modifier * thermal * dt_seconds
