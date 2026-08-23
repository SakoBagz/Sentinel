from sentinel_sim.patterns import expanding_square_pattern, lawnmower_pattern


def test_lawnmower_generates_ordered_legs() -> None:
    points = lawnmower_pattern(
        center_latitude=34.15,
        center_longitude=-118.24,
        altitude_m=120,
        spacing_m=200,
        legs=4,
        leg_length_m=800,
    )
    assert len(points) == 8
    assert [point.sequence for point in points] == list(range(8))
    latitudes = [point.latitude for point in points]
    assert max(latitudes) > min(latitudes)


def test_expanding_square_spirals_outward() -> None:
    points = expanding_square_pattern(
        center_latitude=34.15,
        center_longitude=-118.24,
        altitude_m=100,
        spacing_m=150,
        legs=6,
    )
    assert points[0].latitude == 34.15
    assert len(points) == 7
