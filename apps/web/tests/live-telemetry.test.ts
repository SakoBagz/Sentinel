import { beforeEach, describe, expect, it } from "vitest";

import { VehicleTelemetry, useLiveTelemetry } from "../stores/live-telemetry";

const telemetry = (sequence: number): VehicleTelemetry => ({
  vehicleId: "vehicle-1",
  sequence,
  simTimeMs: sequence * 100,
  latitude: 34,
  longitude: -118,
  altitudeM: 100,
  headingDeg: 0,
  groundSpeedMps: 10,
  batteryPercent: 100,
  gpsQualityPercent: 100,
  sensorStatus: "AVAILABLE",
  missionState: "TRANSIT",
  communicationsState: "HEALTHY",
});

describe("live telemetry sequence accounting", () => {
  beforeEach(() => useLiveTelemetry.getState().reset());

  it("counts gaps, duplicates, and out-of-order delivery", () => {
    const store = useLiveTelemetry.getState();
    store.ingestTelemetry(telemetry(0));
    store.ingestTelemetry(telemetry(2));
    store.ingestTelemetry(telemetry(2));
    store.ingestTelemetry(telemetry(1));

    const state = useLiveTelemetry.getState();
    expect(state.missing).toBe(1);
    expect(state.duplicates).toBe(1);
    expect(state.outOfOrder).toBe(1);
    expect(state.vehicles["vehicle-1"].sequence).toBe(2);
    expect(state.history["vehicle-1"]).toHaveLength(2);
  });
});
