import { TelemetrySample } from "@/lib/api";

export type ReplayVehicle = TelemetrySample & {
  interpolated: boolean;
};

function lerp(start: number | null, end: number | null, fraction: number): number | null {
  if (start === null || end === null) return start ?? end;
  return start + (end - start) * fraction;
}

function lerpAngle(start: number | null, end: number | null, fraction: number): number | null {
  if (start === null || end === null) return start ?? end;
  const delta = ((end - start + 540) % 360) - 180;
  return (start + delta * fraction + 360) % 360;
}

export function interpolateReplaySample(before: TelemetrySample, after: TelemetrySample, timeMs: number): ReplayVehicle {
  const duration = after.sim_time_ms - before.sim_time_ms;
  const fraction = duration > 0 ? Math.min(1, Math.max(0, (timeMs - before.sim_time_ms) / duration)) : 0;
  return {
    ...before,
    sim_time_ms: timeMs,
    latitude: lerp(before.latitude, after.latitude, fraction),
    longitude: lerp(before.longitude, after.longitude, fraction),
    altitude_m: lerp(before.altitude_m, after.altitude_m, fraction),
    heading_deg: lerpAngle(before.heading_deg, after.heading_deg, fraction),
    ground_speed_mps: lerp(before.ground_speed_mps, after.ground_speed_mps, fraction),
    battery_percent: lerp(before.battery_percent, after.battery_percent, fraction),
    interpolated: fraction > 0 && fraction < 1,
  };
}

export function replayStateAt(samples: TelemetrySample[], timeMs: number): ReplayVehicle[] {
  const byVehicle = new Map<string, TelemetrySample[]>();
  for (const sample of samples) {
    const history = byVehicle.get(sample.vehicle_id) ?? [];
    history.push(sample);
    byVehicle.set(sample.vehicle_id, history);
  }
  return [...byVehicle.values()].map((history) => {
    history.sort((left, right) => left.sim_time_ms - right.sim_time_ms || left.sequence - right.sequence);
    const nextIndex = history.findIndex((sample) => sample.sim_time_ms > timeMs);
    if (nextIndex === -1) return { ...history.at(-1)!, interpolated: false };
    if (nextIndex === 0) return { ...history[0], interpolated: false };
    const before = history[nextIndex - 1];
    const after = history[nextIndex];
    return interpolateReplaySample(before, after, timeMs);
  }).map((sample) => ({ ...sample, vehicle_id: sample.vehicle_id || "" })).sort((left, right) => left.vehicle_id.localeCompare(right.vehicle_id));
}
