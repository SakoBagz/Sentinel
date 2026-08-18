import { expect, test } from "@playwright/test";

const apiBase = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8000";

async function json<T>(response: { ok(): boolean; json(): Promise<T> }): Promise<T> {
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test("launches the seeded public demo from the landing page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Launch seeded demo" })).toBeVisible();
  await page.getByRole("button", { name: "Launch seeded demo" }).click();
  await expect(page).toHaveURL(/\/runs\/[^/]+\/live/, { timeout: 30_000 });
  await expect(page.getByLabel("Vehicle detail")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Fleet telemetry" })).toBeVisible();
});

test("runs the browser golden path through live telemetry, replay, and debrief", async ({ page, request }) => {
  test.setTimeout(240_000);
  const suffix = Date.now().toString(36);
  const callsign = `E2E-${suffix}`;
  const mission = await json<{ id: string }>(await request.post(`${apiBase}/api/missions`, {
    data: { name: `Browser golden path ${suffix}`, scenario_type: "environmental_survey" },
  }));
  await json<{ id: string }>(await request.post(`${apiBase}/api/missions/${mission.id}/vehicles`, {
    data: {
      callsign,
      vehicle_type: "SURVEY",
      max_speed_mps: 25,
      cruise_speed_mps: 18,
      battery_capacity: 100,
      telemetry_rate_hz: 10,
      starting_latitude: 34.15,
      starting_longitude: -118.24,
      starting_altitude_m: 100,
    },
  }));
  await page.goto(`/missions/${mission.id}/plan`);
  await expect(page.getByRole("button", { name: `${callsign} SURVEY · 0 route` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create run" })).toBeDisabled();
  const readiness = page.getByLabel("Mission readiness");
  await expect(readiness).toContainText("Resolve before launch");
  const map = page.locator(".map-canvas.maplibregl-map");
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("data-basemap-ready", "true", { timeout: 20_000 });
  const mapBox = await map.boundingBox();
  expect(mapBox).not.toBeNull();
  await map.click({ position: { x: mapBox!.width / 2 + 10, y: mapBox!.height / 2 - 10 } });
  await expect.poll(async () => {
    const response = await request.get(`${apiBase}/api/missions/${mission.id}`);
    return (await response.json() as { waypoints: unknown[] }).waypoints.length;
  }).toBe(1);
  await expect(readiness).toContainText("Ready to create a run");
  await expect(page.getByRole("button", { name: "Create run" })).toBeEnabled();
  await page.getByRole("button", { name: "Create run" }).click();
  await expect(page).toHaveURL(/\/runs\/[^/]+\/live/, { timeout: 15_000 });
  const runId = page.url().match(/\/runs\/([^/]+)\/live/)?.[1];
  expect(runId).toBeTruthy();
  await expect(page.getByLabel("Vehicle detail")).toBeVisible();
  await expect(page.getByLabel("Operational diagnostics")).toBeVisible();

  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page.getByRole("button", { name: "Inject simulated fault" })).toBeEnabled();
  await page.getByRole("button", { name: "Inject simulated fault" }).click();
  await expect.poll(async () => (await request.get(`${apiBase}/api/runs/${runId}`)).json(), { timeout: 120_000 })
    .toMatchObject({ status: "COMPLETED" });
  await expect(page.getByRole("status", { name: "COMPLETED" })).toBeVisible({ timeout: 10_000 });

  await page.goto(`/runs/${runId}/replay`);
  await expect(page.getByText("Historical mission")).toBeVisible();
  await expect(page.getByText(/Samples loaded/)).toBeVisible();
  const replayTime = page.getByLabel("Replay time");
  await page.getByText("mission.completed", { exact: true }).click();
  await expect.poll(async () => replayTime.inputValue()).toBe(await replayTime.getAttribute("max"));

  await page.goto(`/runs/${runId}/debrief`);
  await expect(page.getByText("Operational debrief")).toBeVisible();
  await page.getByRole("button", { name: "Generate debrief" }).click();
  await expect(page.getByText("Analyst response")).toBeVisible({ timeout: 15_000 });
});
