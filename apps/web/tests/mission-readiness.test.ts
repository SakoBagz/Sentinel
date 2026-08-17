import { describe, expect, it } from "vitest";

import { evaluateMissionReadiness } from "../lib/mission-readiness";

describe("mission readiness", () => {
  it("blocks an empty mission with actionable checks", () => {
    const result = evaluateMissionReadiness({
      name: "",
      vehicleCount: 0,
      routedVehicleCount: 0,
      hasSharedRoute: false,
      mapReady: false,
    });

    expect(result.ready).toBe(false);
    expect(result.checks.filter((check) => !check.ready).map((check) => check.id)).toEqual(["identity", "fleet", "routes", "map"]);
  });

  it("passes when every vehicle has a route and the map is ready", () => {
    const result = evaluateMissionReadiness({
      name: "Wildfire survey",
      vehicleCount: 3,
      routedVehicleCount: 3,
      hasSharedRoute: false,
      mapReady: true,
    });

    expect(result.ready).toBe(true);
    expect(result.checks.every((check) => check.ready)).toBe(true);
  });

  it("allows one shared route to cover the fleet", () => {
    const result = evaluateMissionReadiness({
      name: "Search grid",
      vehicleCount: 4,
      routedVehicleCount: 0,
      hasSharedRoute: true,
      mapReady: true,
    });

    expect(result.ready).toBe(true);
    expect(result.checks.find((check) => check.id === "routes")?.detail).toBe("Shared route covers the fleet");
  });

  it("keeps launch blocked until the map is available", () => {
    const result = evaluateMissionReadiness({
      name: "Infrastructure inspection",
      vehicleCount: 1,
      routedVehicleCount: 1,
      hasSharedRoute: false,
      mapReady: false,
    });

    expect(result.ready).toBe(false);
    expect(result.checks.find((check) => check.id === "map")?.detail).toBe("Waiting for map data");
  });
});
