import { describe, expect, it } from "vitest";

import { replayStateAt } from "../lib/replay";

const sample = (sequence: number, simTime: number, latitude: number) => ({
  id: sequence,
  event_id: `00000000-0000-0000-0000-${String(sequence).padStart(12, "0")}`,
  run_id: "00000000-0000-0000-0000-000000000001",
  vehicle_id: "00000000-0000-0000-0000-000000000002",
  sequence,
  sim_time_ms: simTime,
  received_at: "2026-01-01T00:00:00Z",
  latitude,
  longitude: -118.24,
  altitude_m: 100,
  heading_deg: 350,
  ground_speed_mps: 10,
  battery_percent: 99,
  mission_state: "TRANSIT",
  communications_state: "HEALTHY",
});

describe("replay state", () => {
  it("interpolates visual position without changing mission state", () => {
    const state = replayStateAt([sample(1, 0, 34), sample(2, 1_000, 35)], 500);
    expect(state[0].latitude).toBe(34.5);
    expect(state[0].interpolated).toBe(true);
    expect(state[0].mission_state).toBe("TRANSIT");
  });

  it("keeps the nearest persisted state outside the sample window", () => {
    const state = replayStateAt([sample(1, 1_000, 34)], 0);
    expect(state[0].latitude).toBe(34);
    expect(state[0].interpolated).toBe(false);
  });
});
