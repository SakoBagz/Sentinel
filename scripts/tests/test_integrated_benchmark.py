import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from integrated_benchmark import create_benchmark_run


@pytest.mark.asyncio
async def test_integrated_benchmark_rejects_rate_above_tick() -> None:
    with pytest.raises(ValueError, match="no greater than simulation_tick_hz"):
        await create_benchmark_run(
            vehicle_count=1,
            duration_seconds=1,
            telemetry_rate_hz=11,
            persistence_rate_hz=2,
            simulation_tick_hz=10,
            queue_maxsize=10,
            seed=1,
        )
