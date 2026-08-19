import heapq
import math
from dataclasses import dataclass, field
from collections import deque
from typing import Any
from uuid import UUID

from app.domain.enums import FailureType

from sentinel_sim.models import TelemetryEnvelope
from sentinel_sim.random import SeededRandom


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    ordered = sorted(values)
    rank = percentile * (len(ordered) - 1)
    lower = int(rank)
    upper = min(len(ordered) - 1, lower + 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (rank - lower)


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


@dataclass(frozen=True)
class NetworkStatistics:
    """Incremental network accounting for one simulation run.

    The latency sample window is intentionally bounded. Message counts are scalar
    counters, so the runtime never needs to retain the telemetry history to produce
    delivery-integrity metrics.
    """

    generated_messages: int
    delivered_messages: int
    unique_delivered_messages: int
    missing_messages: int
    duplicate_messages: int
    out_of_order_messages: int
    healthy_delivered_messages: int
    modeled_latency_p50_ms: float
    modeled_latency_p95_ms: float
    modeled_latency_p99_ms: float


@dataclass
class _VehicleNetworkState:
    profile: NetworkConfiguration
    state: str = "HEALTHY"
    last_delivery_ms: int = 0
    disconnect_until_ms: int = 0
    recovery_ticks: int = 0
    automatic_disconnect_active: bool = False
    failures: list[FailureWindow] = field(default_factory=list)
    pending: list[tuple[int, int, TelemetryEnvelope, bool]] = field(default_factory=list)


class NetworkSimulator:
    """Seeded network impairment and delivery queue for one simulation run."""

    stale_threshold_ms = 1_000
    disconnect_threshold_ms = 3_000

    def __init__(
        self,
        random: SeededRandom,
        profiles: dict[UUID, NetworkConfiguration] | None = None,
        *,
        latency_sample_limit: int = 10_000,
    ) -> None:
        if latency_sample_limit <= 0:
            raise ValueError("latency_sample_limit must be positive")
        self.random = random
        self.profiles = profiles or {}
        self.vehicles: dict[UUID, _VehicleNetworkState] = {}
        self._ordinal = 0
        self._generated_messages = 0
        self._delivered_messages = 0
        self._unique_delivered_messages = 0
        self._duplicate_messages = 0
        self._out_of_order_messages = 0
        self._healthy_delivered_messages = 0
        self._last_delivered_sequence: dict[UUID, int] = {}
        self._latency_samples: deque[float] = deque(maxlen=latency_sample_limit)
        self._last_delivery_latencies: list[float] = []

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
        self._generated_messages += 1
        effective, blackout, _ = self._effective(envelope.vehicle_id, envelope.sim_time_ms)
        if blackout or state.automatic_disconnect_active:
            return
        if self.random.random() < effective.packet_loss_percent / 100:
            return
        latency = max(0.0, effective.base_latency_ms + self.random.uniform(-effective.jitter_ms, effective.jitter_ms))
        self._ordinal += 1
        heapq.heappush(state.pending, (envelope.sim_time_ms + round(latency), self._ordinal, envelope, False))
        if self.random.random() < effective.duplicate_percent / 100:
            self._ordinal += 1
            duplicate_latency = max(0.0, latency + self.random.uniform(0, effective.jitter_ms))
            heapq.heappush(
                state.pending,
                (envelope.sim_time_ms + round(duplicate_latency), self._ordinal, envelope, True),
            )

    def _record_delivery(
        self,
        state: _VehicleNetworkState,
        scheduled_delivery_ms: int,
        delivered_at_ms: int,
        envelope: TelemetryEnvelope,
        is_duplicate: bool,
    ) -> float:
        self._delivered_messages += 1
        if is_duplicate:
            self._duplicate_messages += 1
        else:
            self._unique_delivered_messages += 1
        previous_sequence = self._last_delivered_sequence.get(envelope.vehicle_id)
        if previous_sequence is not None and envelope.sequence < previous_sequence:
            self._out_of_order_messages += 1
        self._last_delivered_sequence[envelope.vehicle_id] = envelope.sequence
        if envelope.payload.get("communications_state") == "HEALTHY":
            self._healthy_delivered_messages += 1
        modeled_latency_ms = max(0.0, float(scheduled_delivery_ms - envelope.sim_time_ms))
        self._latency_samples.append(modeled_latency_ms)
        state.last_delivery_ms = delivered_at_ms
        if state.recovery_ticks > 0:
            state.recovery_ticks -= 1
        return modeled_latency_ms

    def drain(self, sim_time_ms: int) -> list[TelemetryEnvelope]:
        delivered: list[TelemetryEnvelope] = []
        self._last_delivery_latencies = []
        for vehicle_id, state in self.vehicles.items():
            if state.state == "DISCONNECTED":
                continue
            while state.pending and state.pending[0][0] <= sim_time_ms:
                scheduled_delivery_ms, _, envelope, is_duplicate = heapq.heappop(state.pending)
                delivered.append(envelope)
                self._last_delivery_latencies.append(
                    self._record_delivery(
                        state, scheduled_delivery_ms, sim_time_ms, envelope, is_duplicate
                    )
                )
        return delivered

    def flush(self, sim_time_ms: int) -> list[TelemetryEnvelope]:
        """Deliver queued packets at run shutdown without advancing simulation time.

        Latency is a delivery concern, so a completed run should not silently lose
        packets that were already accepted by the network. Active blackouts and
        automatic disconnects still suppress delivery because those packets were
        never available to the ground consumer.
        """
        delivered: list[TelemetryEnvelope] = []
        self._last_delivery_latencies = []
        for state in self.vehicles.values():
            blackout_active = any(
                window.failure_type is FailureType.COMMUNICATIONS_BLACKOUT and window.active(sim_time_ms)
                for window in state.failures
            )
            if blackout_active or state.automatic_disconnect_active:
                continue
            while state.pending:
                scheduled_delivery_ms, _, envelope, is_duplicate = heapq.heappop(state.pending)
                delivered.append(envelope)
                self._last_delivery_latencies.append(
                    self._record_delivery(
                        state, scheduled_delivery_ms, sim_time_ms, envelope, is_duplicate
                    )
                )
        return delivered

    def take_last_delivery_latencies(self) -> tuple[float, ...]:
        """Return and clear only the most recent drain/flush latency batch."""
        values = tuple(self._last_delivery_latencies)
        self._last_delivery_latencies = []
        return values

    def statistics(self) -> NetworkStatistics:
        latency_values = list(self._latency_samples)
        return NetworkStatistics(
            generated_messages=self._generated_messages,
            delivered_messages=self._delivered_messages,
            unique_delivered_messages=self._unique_delivered_messages,
            missing_messages=max(0, self._generated_messages - self._unique_delivered_messages),
            duplicate_messages=self._duplicate_messages,
            out_of_order_messages=self._out_of_order_messages,
            healthy_delivered_messages=self._healthy_delivered_messages,
            modeled_latency_p50_ms=_percentile(latency_values, 0.50),
            modeled_latency_p95_ms=_percentile(latency_values, 0.95),
            modeled_latency_p99_ms=_percentile(latency_values, 0.99),
        )

    def pending_count(self) -> int:
        return sum(len(state.pending) for state in self.vehicles.values())

    def state(self, vehicle_id: UUID) -> str:
        return self._state(vehicle_id).state
