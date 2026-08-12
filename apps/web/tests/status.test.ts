import { describe, expect, it } from "vitest";

import { formatCommunicationsState } from "../lib/status";

describe("communications status", () => {
  it("formats controlled state values for the UI", () => {
    expect(formatCommunicationsState("DISCONNECTED")).toBe("DISCONNECTED");
    expect(formatCommunicationsState("RECOVERING")).toBe("RECOVERING");
  });
});

