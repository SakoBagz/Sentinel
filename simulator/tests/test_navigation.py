import math

from sentinel_sim.navigation import bearing_between, destination_point, distance_between, interpolate_position, Position


def test_haversine_distance_and_bearing() -> None:
    distance = distance_between(0, 0, 1, 0)
    assert 110_000 < distance < 112_000
    assert math.isclose(bearing_between(0, 0, 1, 0), 0, abs_tol=0.01)
    assert math.isclose(bearing_between(0, 0, 0, 1), 90, abs_tol=0.01)


def test_destination_and_interpolation() -> None:
    latitude, longitude = destination_point(0, 0, 90, 1000)
    assert abs(latitude) < 0.01
    assert longitude > 0
    point = interpolate_position(Position(0, 0, 0), Position(1, 2, 100), 0.5)
    assert point == Position(0.5, 1, 50)

