from sentinel_sim.battery import BatteryModel


def test_high_speed_increases_drain() -> None:
    model = BatteryModel()
    cruise = model.drain_percent(18.0, 1.0, cruise_speed_mps=18.0)
    fast = model.drain_percent(30.0, 1.0, cruise_speed_mps=18.0)
    assert fast > cruise
