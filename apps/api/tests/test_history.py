from datetime import datetime, timezone
from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.models import Base
from app.db.models.entities import Mission, MissionEvent, MissionVehicle, RunVehicle, SimulationRun, TelemetrySample, VehicleDefinition
from app.domain.enums import EventSeverity, EventType, MissionStatus, RunStatus
from app.services.history_service import event_page, replay_sample


MISSION_ID = UUID("00000000-0000-0000-0000-000000000201")
DEFINITION_ID = UUID("00000000-0000-0000-0000-000000000202")
MEMBERSHIP_ID = UUID("00000000-0000-0000-0000-000000000203")
RUN_ID = UUID("00000000-0000-0000-0000-000000000204")
RUN_VEHICLE_ID = UUID("00000000-0000-0000-0000-000000000205")


@pytest.mark.asyncio
async def test_event_cursor_keeps_same_timestamp_events() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    definition = VehicleDefinition(
        id=DEFINITION_ID,
        callsign="UAV-HISTORY",
        vehicle_type="SURVEY",
        max_speed_mps=25,
        cruise_speed_mps=10,
        battery_capacity=100,
        telemetry_rate_hz=10,
        configuration={},
    )
    mission = Mission(id=MISSION_ID, name="History", status=MissionStatus.READY)
    membership = MissionVehicle(id=MEMBERSHIP_ID, mission=mission, vehicle_definition=definition, configuration={})
    run = SimulationRun(
        id=RUN_ID,
        mission=mission,
        status=RunStatus.COMPLETED,
        random_seed=7,
        simulation_speed=1,
        configuration={},
        created_at=datetime.now(timezone.utc),
    )
    run_vehicle = RunVehicle(id=RUN_VEHICLE_ID, run=run, vehicle_definition=definition, configuration={})
    session_events = [
        MissionEvent(
            id=UUID(f"00000000-0000-0000-0000-00000000020{i}"),
            run_id=RUN_ID,
            vehicle_id=RUN_VEHICLE_ID,
            event_type=EventType.VEHICLE_READY,
            severity=EventSeverity.INFO,
            sim_time_ms=1_000,
            timestamp=datetime.now(timezone.utc),
            payload={"ordinal": i},
        )
        for i in (6, 7, 8)
    ]
    async with factory() as session:
        session.add_all([definition, mission, membership, run, run_vehicle, *session_events])
        await session.commit()
        first, cursor = await event_page(
            session,
            RUN_ID,
            start_ms=None,
            end_ms=None,
            limit=2,
            cursor=None,
            vehicle_id=None,
            event_type=None,
            severity=None,
        )
        second, next_cursor = await event_page(
            session,
            RUN_ID,
            start_ms=None,
            end_ms=None,
            limit=2,
            cursor=cursor,
            vehicle_id=None,
            event_type=None,
            severity=None,
        )

    assert [event.payload["ordinal"] for event in first] == [6, 7]
    assert cursor is not None
    assert [event.payload["ordinal"] for event in second] == [8]
    assert next_cursor is None
    await engine.dispose()


@pytest.mark.asyncio
async def test_replay_sample_is_bounded_and_spans_the_full_run() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    definitions = [VehicleDefinition(
        id=UUID(f"00000000-0000-0000-0000-00000000021{index}"), callsign=f"UAV-REPLAY-{index}",
        vehicle_type="SURVEY", max_speed_mps=25, cruise_speed_mps=10, battery_capacity=100,
        telemetry_rate_hz=10, configuration={},
    ) for index in (1, 2)]
    mission = Mission(id=MISSION_ID, name="Replay", status=MissionStatus.COMPLETED)
    memberships = [MissionVehicle(
        id=UUID(f"00000000-0000-0000-0000-00000000022{index}"), mission=mission,
        vehicle_definition=definition, configuration={},
    ) for index, definition in enumerate(definitions, start=1)]
    run = SimulationRun(
        id=RUN_ID, mission=mission, status=RunStatus.COMPLETED, random_seed=7,
        simulation_speed=1, configuration={}, created_at=datetime.now(timezone.utc),
    )
    run_vehicles = [RunVehicle(
        id=UUID(f"00000000-0000-0000-0000-00000000023{index}"), run=run,
        vehicle_definition=definition, configuration={},
    ) for index, definition in enumerate(definitions, start=1)]
    samples = [TelemetrySample(
        event_id=UUID(f"00000000-0000-0000-{vehicle_index:04d}-{sequence:012d}"),
        run_id=RUN_ID, vehicle_id=run_vehicle.id, sequence=sequence, sim_time_ms=sequence * 1_000,
    ) for vehicle_index, run_vehicle in enumerate(run_vehicles, start=1) for sequence in range(12)]
    async with factory() as session:
        session.add_all([*definitions, mission, *memberships, run, *run_vehicles, *samples])
        await session.commit()
        result = await replay_sample(
            session, RUN_ID, start_ms=None, end_ms=None, limit=6, vehicle_id=None,
        )
    assert len(result) <= 6
    assert {sample.vehicle_id for sample in result} == {vehicle.id for vehicle in run_vehicles}
    assert min(sample.sim_time_ms for sample in result) == 0
    assert max(sample.sim_time_ms for sample in result) == 11_000
    await engine.dispose()
