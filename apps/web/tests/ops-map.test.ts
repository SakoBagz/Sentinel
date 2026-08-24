import { describe, expect, it } from "vitest";

import {
  buildLineFeatureCollection,
  buildVehicleFeatureCollection,
  communicationsTone,
  filterValidCoordinates,
  groupSamplesIntoLines,
  isValidCoordinate,
  isValidOpsCoordinate,
} from "../lib/ops-map";

describe("coordinate validation", () => {
  it("accepts in-range coordinates", () => {
    expect(isValidCoordinate(-118.24, 34.15)).toBe(true);
    expect(isValidOpsCoordinate([-118.24, 34.15])).toBe(true);
  });

  it("rejects out-of-range or non-finite values", () => {
    expect(isValidCoordinate(200, 34)).toBe(false);
    expect(isValidCoordinate(-118, 95)).toBe(false);
    expect(isValidCoordinate(Number.NaN, 34)).toBe(false);
  });

  it("filters invalid trail points", () => {
    expect(
      filterValidCoordinates([
        [-118.24, 34.15],
        [200, 34],
        [-118.25, 34.16],
      ]),
    ).toEqual([
      [-118.24, 34.15],
      [-118.25, 34.16],
    ]);
  });
});

describe("line feature collection", () => {
  it("drops lines with fewer than two valid points", () => {
    const collection = buildLineFeatureCollection([
      { id: "short", coordinates: [[-118.24, 34.15]] },
      {
        id: "valid",
        coordinates: [
          [-118.24, 34.15],
          [-118.25, 34.16],
        ],
      },
    ]);

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]?.properties.id).toBe("valid");
  });

  it("groups telemetry samples per vehicle", () => {
    const lines = groupSamplesIntoLines([
      { vehicle_id: "uav-1", longitude: -118.24, latitude: 34.15 },
      { vehicle_id: "uav-1", longitude: -118.25, latitude: 34.16 },
      { vehicle_id: "uav-2", longitude: 200, latitude: 34.15 },
      { vehicle_id: "uav-2", longitude: -118.26, latitude: 34.17 },
    ]);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.id).toBe("uav-1");
    expect(lines[0]?.coordinates).toEqual([
      [-118.24, 34.15],
      [-118.25, 34.16],
    ]);
  });
});

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

  it("skips vehicles with invalid coordinates", () => {
    const collection = buildVehicleFeatureCollection([
      {
        vehicleId: "uav-bad",
        longitude: 500,
        latitude: 34.15,
        headingDeg: 0,
        callsign: "BAD",
        tone: "neutral",
        selected: false,
      },
    ]);
    expect(collection.features).toHaveLength(0);
  });

  it("maps communications states to marker tones", () => {
    expect(communicationsTone("HEALTHY")).toBe("healthy");
    expect(communicationsTone("DEGRADED")).toBe("degraded");
    expect(communicationsTone("DISCONNECTED")).toBe("critical");
  });
});
