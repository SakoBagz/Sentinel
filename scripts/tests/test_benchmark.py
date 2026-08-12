import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from benchmark import run_profile  # noqa: E402


def test_benchmark_profile_is_repeatable_for_message_counts() -> None:
    first = run_profile(2, 10, 1, 42)
    second = run_profile(2, 10, 1, 42)

    assert first["messages"] == second["messages"]
    assert first["messages"]["generated"] == 20
    assert first["messages"]["delivered"] == 20
    assert first["messages"]["persisted"] == 20
    assert first["messages"]["errors"] == 0
