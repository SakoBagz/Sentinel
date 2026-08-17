import { describe, expect, it } from "vitest";

import { formatMissionDate, scenarioLabel, statusLabel } from "../lib/mission-catalog";

describe("mission catalog vocabulary", () => {
  it("uses readable labels for controlled operation types", () => {
    expect(scenarioLabel("infrastructure_inspection")).toBe("Infrastructure inspection");
    expect(scenarioLabel("unknown_type")).toBe("unknown type");
    expect(scenarioLabel(null)).toBe("General operation");
  });

  it("formats lifecycle state and UTC update dates", () => {
    expect(statusLabel("READY")).toBe("Ready");
    expect(formatMissionDate("2026-08-17T07:00:00Z")).toBe("Aug 17, 2026");
  });
});
