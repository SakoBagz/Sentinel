import math
from dataclasses import dataclass

EARTH_RADIUS_M = 6_371_000.0


@dataclass(frozen=True)
class Position:
    latitude: float
    longitude: float
    altitude_m: float


def _validate_lat_lon(latitude: float, longitude: float) -> None:
    if not -90 <= latitude <= 90:
        raise ValueError("latitude must be between -90 and 90")
    if not -180 <= longitude <= 180:
        raise ValueError("longitude must be between -180 and 180")


def distance_between(
    start_latitude: float, start_longitude: float, end_latitude: float, end_longitude: float
) -> float:
    _validate_lat_lon(start_latitude, start_longitude)
    _validate_lat_lon(end_latitude, end_longitude)
    lat1, lat2 = math.radians(start_latitude), math.radians(end_latitude)
    delta_lat = math.radians(end_latitude - start_latitude)
    delta_lon = math.radians(end_longitude - start_longitude)
    haversine = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(min(1.0, haversine)))


def bearing_between(
    start_latitude: float, start_longitude: float, end_latitude: float, end_longitude: float
) -> float:
    _validate_lat_lon(start_latitude, start_longitude)
    _validate_lat_lon(end_latitude, end_longitude)
    lat1, lat2 = math.radians(start_latitude), math.radians(end_latitude)
    delta_lon = math.radians(end_longitude - start_longitude)
    x = math.sin(delta_lon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(delta_lon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def destination_point(
    latitude: float, longitude: float, bearing_deg: float, distance_m: float
) -> tuple[float, float]:
    _validate_lat_lon(latitude, longitude)
    if distance_m < 0:
        raise ValueError("distance_m must be non-negative")
    angular_distance = distance_m / EARTH_RADIUS_M
    bearing = math.radians(bearing_deg)
    lat1, lon1 = math.radians(latitude), math.radians(longitude)
    lat2 = math.asin(
        math.sin(lat1) * math.cos(angular_distance)
        + math.cos(lat1) * math.sin(angular_distance) * math.cos(bearing)
    )
    lon2 = lon1 + math.atan2(
        math.sin(bearing) * math.sin(angular_distance) * math.cos(lat1),
        math.cos(angular_distance) - math.sin(lat1) * math.sin(lat2),
    )
    normalized_lon = (math.degrees(lon2) + 540) % 360 - 180
    return math.degrees(lat2), normalized_lon


def interpolate_position(start: Position, end: Position, fraction: float) -> Position:
    clamped = min(1.0, max(0.0, fraction))
    return Position(
        latitude=start.latitude + (end.latitude - start.latitude) * clamped,
        longitude=start.longitude + (end.longitude - start.longitude) * clamped,
        altitude_m=start.altitude_m + (end.altitude_m - start.altitude_m) * clamped,
    )

