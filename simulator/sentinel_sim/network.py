import heapq
import math
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from app.domain.enums import FailureType

from sentinel_sim.models import TelemetryEnvelope
from sentinel_sim.random import SeededRandom


@dataclass(frozen=True)
class NetworkConfiguration:
    base_latency_ms: float = 0.0
    jitter_ms: float = 0.0
    packet_loss_percent: float = 0.0
    duplicate_percent: float = 0.0
    disconnect_probability: float = 0.0
    disconnect_duration_min_ms: int = 1000
    disconnect_duration_max_ms: int = 3000

    def __post_init__(self) -> None:
        if not math.isfinite(self.base_latency_ms) or not math.isfinite(self.jitter_ms):
            raise ValueError("latency and jitter must be finite")
        if self.base_latency_ms < 0 or self.jitter_ms < 0:
            raise ValueError("latency and jitter cannot be negative")
        for name in ("packet_loss_percent", "duplicate_percent", "disconnect_probability"):
            value = getattr(self, name)
            if not math.isfinite(value) or not 0 <= value <= 100:
                raise ValueError(f"{name} must be between 0 and 100")
        if self.disconnect_duration_min_ms <= 0 or self.disconnect_duration_max_ms < self.disconnect_duration_min_ms:
            raise ValueError("disconnect duration bounds are invalid")


@dataclass(frozen=True)
class FailureWindow:
    failure_id: UUID
    failure_type: FailureType
    start_sim_time_ms: int
    end_sim_time_ms: int
    configuration: dict[str, Any] = field(default_factory=dict)

    def active(self, sim_time_ms: int) -> bool:
        return self.start_sim_time_ms <= sim_time_ms < self.end_sim_time_ms


@dataclass
class _VehicleNetworkState:
    profile: NetworkConfiguration
    state: str = "HEALTHY"
    last_delivery_ms: int = 0
    disconnect_until_ms: int = 0
    recovery_ticks: int = 0
    automatic_disconnect_active: bool = False
    failures: list[FailureWindow] = field(default_factory=list)
    pending: list[tuple[int, int, TelemetryEnvelope]] = field(default_factory=list)


class NetworkSimulator:
    """Seeded network impairment and delivery queue for one simulation run."""

    stale_threshold_ms = 1_000
    disconnect_threshold_ms = 3_000

    def __init__(self, random: SeededRandom, profiles: dict[UUID, NetworkConfiguration] | None = None) -> None:
        self.random = random
        self.profiles = profiles or {}
        self.vehicles: dict[UUID, _VehicleNetworkState] = {}
        self._ordinal = 0

    def _state(self, vehicle_id: UUID) -> _VehicleNetworkState:
        return self.vehicles.setdefault(vehicle_id, _VehicleNetworkState(self.profiles.get(vehicle_id, NetworkConfiguration())))

    def inject_failure(self, vehicle_id: UUID, window: FailureWindow) -> None:
        state = self._state(vehicle_id)
        state.failures = [item for item in state.failures if item.failure_id != window.failure_id]
        state.failures.append(window)

    def clear_failure(self, vehicle_id: UUID, failure_id: UUID, sim_time_ms: int) -> FailureWindow | None:
        state = self._state(vehicle_id)
        for index, window in enumerate(state.failures):
            if window.failure_id == failure_id:
                state.failures.pop(index)
                return FailureWindow(window.failure_id, window.failure_type, window.start_sim_time_ms, sim_time_ms, window.configuration)
        return None

    def active_failures(self, vehicle_id: UUID, sim_time_ms: int) -> list[FailureWindow]:
        return [item for item in self._state(vehicle_id).failures if item.active(sim_time_ms)]

    def expired_failures(self, vehicle_id: UUID, sim_time_ms: int) -> list[FailureWindow]:
        state = self._state(vehicle_id)
        expired = [item for item in state.failures if item.end_sim_time_ms <= sim_time_ms]
        if expired:
            state.failures = [item for item in state.failures if item.end_sim_time_ms > sim_time_ms]
            if any(item.failure_type is FailureType.COMMUNICATIONS_BLACKOUT for item in expired):
                state.recovery_ticks = max(state.recovery_ticks, 2)
        return expired

    def _effective(self, vehicle_id: UUID, sim_time_ms: int) -> tuple[NetworkConfiguration, bool, bool]:
        state = self._state(vehicle_id)
        active = self.active_failures(vehicle_id, sim_time_ms)
        latency = state.profile.base_latency_ms
        jitter = state.profile.jitter_ms
        loss = state.profile.packet_loss_percent
        duplicate = state.profile.duplicate_percent
        blackout = False
        for window in active:
            if window.failure_type is FailureType.COMMUNICATIONS_BLACKOUT:
                blackout = True
            elif window.failure_type is FailureType.HIGH_LATENCY:
                latency += self._bounded_number(window.configuration, "latency_ms", 300.0, 0.0, 60_000.0)
                jitter += self._bounded_number(window.configuration, "jitter_ms", 50.0, 0.0, 60_000.0)
            elif window.failure_type is FailureType.PACKET_LOSS:
                loss = max(loss, self._bounded_number(window.configuration, "packet_loss_percent", 25.0, 0.0, 100.0))
            elif window.failure_type is FailureType.SERVICE_DELAY:
                latency += self._bounded_number(window.configuration, "delay_ms", 500.0, 0.0, 60_000.0)
        return NetworkConfiguration(
            base_latency_ms=latency,
            jitter_ms=jitter,
            packet_loss_percent=loss,
            duplicate_percent=duplicate,
            disconnect_probability=state.profile.disconnect_probability,
            disconnect_duration_min_ms=state.profile.disconnect_duration_min_ms,
            disconnect_duration_max_ms=state.profile.disconnect_duration_max_ms,
        ), blackout, bool(active)

    @staticmethod
    def _bounded_number(configuration: dict[str, Any], key: str, default: float, lower: float, upper: float) -> float:
        try:
            value = float(configuration.get(key, default))
        except (TypeError, ValueError):
            return default
        if not math.isfinite(value):
            return default
        return min(upper, max(lower, value))

    def advance(self, vehicle_id: UUID, sim_time_ms: int, dt_ms: int) -> str:
        state = self._state(vehicle_id)
        effective, blackout, has_failure = self._effective(vehicle_id, sim_time_ms)
        if not blackout and not state.automatic_disconnect_active and state.state == "HEALTHY":
            if self.random.random() < effective.disconnect_probability / 100 * (dt_ms / 1000):
                state.automatic_disconnect_active = True
                state.disconnect_until_ms = sim_time_ms + self.random.randint(
                    effective.disconnect_duration_min_ms, effective.disconnect_duration_max_ms
                )
        if state.automatic_disconnect_active and sim_time_ms >= state.disconnect_until_ms:
            state.automatic_disconnect_active = False
            state.recovery_ticks = 2
        if blackout or state.automatic_disconnect_active:
            state.state = "DISCONNECTED"
        elif state.recovery_ticks > 0:
            state.state = "RECOVERING"
        elif sim_time_ms - state.last_delivery_ms >= self.disconnect_threshold_ms:
            state.state = "DISCONNECTED"
        elif has_failure or effective.packet_loss_percent >= 5 or effective.base_latency_ms >= 200:
            state.state = "DEGRADED"
        elif sim_time_ms - state.last_delivery_ms >= self.stale_threshold_ms:
            state.state = "STALE"
        else:
            state.state = "HEALTHY"
        return state.state

    def submit(self, envelope: TelemetryEnvelope) -> None:
        state = self._state(envelope.vehicle_id)
        effective, blackout, _ = self._effective(envelope.vehicle_id, envelope.sim_time_ms)
        if blackout or state.automatic_disconnect_active:
            return
        if self.random.random() < effective.packet_loss_percent / 100:
            return
        latency = max(0.0, effective.base_latency_ms + self.random.uniform(-effective.jitter_ms, effective.jitter_ms))
        self._ordinal += 1
        heapq.heappush(state.pending, (envelope.sim_time_ms + round(latency), self._ordinal, envelope))
        if self.random.random() < effective.duplicate_percent / 100:
            self._ordinal += 1
            duplicate_latency = max(0.0, latency + self.random.uniform(0, effective.jitter_ms))
            heapq.heappush(state.pending, (envelope.sim_time_ms + round(duplicate_latency), self._ordinal, envelope))

    def drain(self, sim_time_ms: int) -> list[TelemetryEnvelope]:
        delivered: list[TelemetryEnvelope] = []
        for vehicle_id, state in self.vehicles.items():
            if state.state == "DISCONNECTED":
                continue
            while state.pending and state.pending[0][0] <= sim_time_ms:
                _, _, envelope = heapq.heappop(state.pending)
                delivered.append(envelope)
                state.last_delivery_ms = sim_time_ms
                if state.recovery_ticks > 0:
                    state.recovery_ticks -= 1
        return delivered

    def flush(self, sim_time_ms: int) -> list[TelemetryEnvelope]:
        """Deliver queued packets at run shutdown without advancing simulation time.

        Latency is a delivery concern, so a completed run should not silently lose
        packets that were already accepted by the network. Active blackouts and
        automatic disconnects still suppress delivery because those packets were
        never available to the ground consumer.
        """
        delivered: list[TelemetryEnvelope] = []
        for state in self.vehicles.values():
            blackout_active = any(
                window.failure_type is FailureType.COMMUNICATIONS_BLACKOUT and window.active(sim_time_ms)
                for window in state.failures
            )
            if blackout_active or state.automatic_disconnect_active:
                continue
            while state.pending:
                _, _, envelope = heapq.heappop(state.pending)
                delivered.append(envelope)
                state.last_delivery_ms = sim_time_ms
        return delivered

    def pending_count(self) -> int:
        return sum(len(state.pending) for state in self.vehicles.values())

    def state(self, vehicle_id: UUID) -> str:
        return self._state(vehicle_id).state
