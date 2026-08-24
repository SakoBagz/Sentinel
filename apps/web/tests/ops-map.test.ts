import { describe, expect, it } from "vitest";

import { buildVehicleFeatureCollection, communicationsTone } from "../lib/ops-map";

describe("vehicle map layers", () => {
  it("builds one feature per vehicle with shared selection state", () => {
    const collection = buildVehicleFeatureCollection([
      {
        vehicleId: "uav-1",
        longitude: -118.24,
        latitude: 34.15,
        headingDeg: 90,
        callsign: "UAV-01",
        tone: "healthy",
        selected: true,
      },
      {
        vehicleId: "uav-2",
        longitude: -118.25,
        latitude: 34.16,
        headingDeg: 180,
        callsign: "UAV-02",
        tone: "neutral",
        selected: false,
      },
    ]);

    expect(collection.features).toHaveLength(2);
    expect(collection.features[0]?.geometry.coordinates).toEqual([-118.24, 34.15]);
    expect(collection.features[0]?.properties.anySelected).toBe(true);
    expect(collection.features[1]?.properties.anySelected).toBe(true);
  });

  it("maps communications states to marker tones", () => {
    expect(communicationsTone("HEALTHY")).toBe("healthy");
    expect(communicationsTone("DEGRADED")).toBe("degraded");
    expect(communicationsTone("DISCONNECTED")).toBe("critical");
  });
});
