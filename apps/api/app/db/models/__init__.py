from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""


# Import models after Base exists so Alembic can discover all tables from metadata.
from app.db.models.entities import (  # noqa: E402,F401
    Debrief,
    FailureInjection,
    Mission,
    MissionEvent,
    MissionVehicle,
    NetworkProfile,
    RunVehicle,
    SimulationRun,
    TelemetrySample,
    VehicleDefinition,
    Waypoint,
)
