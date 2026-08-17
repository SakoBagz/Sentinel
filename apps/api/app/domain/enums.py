from enum import StrEnum


class MissionStatus(StrEnum):
    DRAFT = "DRAFT"
    READY = "READY"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    ABORTED = "ABORTED"


class MissionScenario(StrEnum):
    SEARCH_AND_RESCUE = "search_and_rescue"
    WILDFIRE_MONITORING = "wildfire_monitoring"
    ENVIRONMENTAL_SURVEY = "environmental_survey"
    INFRASTRUCTURE_INSPECTION = "infrastructure_inspection"
    MAPPING = "mapping"
    COMMUNICATIONS_RELAY = "communications_relay"
    ANGELES_FOREST_SURVEY = "angeles_forest_survey"


class RunStatus(StrEnum):
    READY = "READY"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    ABORTED = "ABORTED"


class VehicleMissionState(StrEnum):
    IDLE = "IDLE"
    READY = "READY"
    LAUNCHING = "LAUNCHING"
    TRANSIT = "TRANSIT"
    EXECUTING = "EXECUTING"
    RETURNING = "RETURNING"
    LANDED = "LANDED"
    COMPLETE = "COMPLETE"
    PAUSED = "PAUSED"
    ABORTED = "ABORTED"


class CommunicationsState(StrEnum):
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    STALE = "STALE"
    DISCONNECTED = "DISCONNECTED"
    RECOVERING = "RECOVERING"


class WaypointAction(StrEnum):
    TRANSIT = "TRANSIT"
    HOLD = "HOLD"
    SURVEY = "SURVEY"
    RETURN = "RETURN"


class EventSeverity(StrEnum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class EventType(StrEnum):
    MISSION_CREATED = "mission.created"
    MISSION_UPDATED = "mission.updated"
    MISSION_STARTED = "mission.started"
    MISSION_PAUSED = "mission.paused"
    MISSION_RESUMED = "mission.resumed"
    MISSION_COMPLETED = "mission.completed"
    MISSION_ABORTED = "mission.aborted"
    VEHICLE_READY = "vehicle.ready"
    VEHICLE_LAUNCHED = "vehicle.launched"
    VEHICLE_WAYPOINT_REACHED = "vehicle.waypoint_reached"
    VEHICLE_RETURNING = "vehicle.returning"
    VEHICLE_LANDED = "vehicle.landed"
    VEHICLE_COMPLETED = "vehicle.completed"
    VEHICLE_TELEMETRY = "vehicle.telemetry"
    COMMUNICATIONS_DEGRADED = "communications.degraded"
    COMMUNICATIONS_STALE = "communications.stale"
    COMMUNICATIONS_LOST = "communications.lost"
    COMMUNICATIONS_RECOVERING = "communications.recovering"
    COMMUNICATIONS_RESTORED = "communications.restored"
    BATTERY_LOW = "battery.low"
    BATTERY_CRITICAL = "battery.critical"
    FAILURE_INJECTED = "failure.injected"
    FAILURE_CLEARED = "failure.cleared"
    SYSTEM_WARNING = "system.warning"
    SYSTEM_ERROR = "system.error"


class FailureType(StrEnum):
    COMMUNICATIONS_BLACKOUT = "COMMUNICATIONS_BLACKOUT"
    HIGH_LATENCY = "HIGH_LATENCY"
    PACKET_LOSS = "PACKET_LOSS"
    GPS_QUALITY_DEGRADATION = "GPS_QUALITY_DEGRADATION"
    BATTERY_ANOMALY = "BATTERY_ANOMALY"
    SENSOR_UNAVAILABLE = "SENSOR_UNAVAILABLE"
    SERVICE_DELAY = "SERVICE_DELAY"
