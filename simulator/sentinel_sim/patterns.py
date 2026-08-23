"""Civilian search-pattern helpers (SAR lawnmower / expanding square)."""

from __future__ import annotations

from dataclasses import dataclass

from sentinel_sim.navigation import destination_point


@dataclass(frozen=True)
class PatternPoint:
    latitude: float
    longitude: float
    altitude_m: float
    sequence: int


def lawnmower_pattern(
    *,
    center_latitude: float,
    center_longitude: float,
    altitude_m: float,
    spacing_m: float,
    legs: int,
    leg_length_m: float,
) -> list[PatternPoint]:
    if legs < 2:
        raise ValueError("legs must be at least 2")
    if spacing_m <= 0 or leg_length_m <= 0:
        raise ValueError("spacing_m and leg_length_m must be positive")
    half_width = ((legs - 1) * spacing_m) / 2.0
    points: list[PatternPoint] = []
    sequence = 0
    for index in range(legs):
        lateral = -half_width + index * spacing_m
        bearing = 90.0 if lateral >= 0 else 270.0
        lane_lat, lane_lon = destination_point(center_latitude, center_longitude, bearing, abs(lateral))
        south_lat, south_lon = destination_point(lane_lat, lane_lon, 180.0, leg_length_m / 2.0)
        north_lat, north_lon = destination_point(lane_lat, lane_lon, 0.0, leg_length_m / 2.0)
        if index % 2 == 0:
            first, second = (south_lat, south_lon), (north_lat, north_lon)
        else:
            first, second = (north_lat, north_lon), (south_lat, south_lon)
        points.append(PatternPoint(first[0], first[1], altitude_m, sequence))
        sequence += 1
        points.append(PatternPoint(second[0], second[1], altitude_m, sequence))
        sequence += 1
    return points


def expanding_square_pattern(
    *,
    center_latitude: float,
    center_longitude: float,
    altitude_m: float,
    spacing_m: float,
    legs: int,
) -> list[PatternPoint]:
    if legs < 2:
        raise ValueError("legs must be at least 2")
    if spacing_m <= 0:
        raise ValueError("spacing_m must be positive")
    points: list[PatternPoint] = [PatternPoint(center_latitude, center_longitude, altitude_m, 0)]
    latitude, longitude = center_latitude, center_longitude
    bearings = (0.0, 90.0, 180.0, 270.0)
    distance = spacing_m
    sequence = 1
    for index in range(legs):
        bearing = bearings[index % 4]
        latitude, longitude = destination_point(latitude, longitude, bearing, distance)
        points.append(PatternPoint(latitude, longitude, altitude_m, sequence))
        sequence += 1
        if index % 2 == 1:
            distance += spacing_m
    return points
