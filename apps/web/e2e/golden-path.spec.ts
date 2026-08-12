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
  await expect(page.getByText("Vehicle detail")).toBeVisible();
  await expect(page.getByText(/Fleet · (LIVE|RECONNECTING|DISCONNECTED)/)).toBeVisible();
});

test("runs the browser golden path through live telemetry, replay, and debrief", async ({ page, request }) => {
  const suffix = Date.now().toString(36);
  const mission = await json<{ id: string }>(await request.post(`${apiBase}/api/missions`, {
    data: { name: `Browser golden path ${suffix}`, scenario_type: "environmental_survey" },
  }));
  const vehicle = await json<{ id: string }>(await request.post(`${apiBase}/api/missions/${mission.id}/vehicles`, {
    data: {
      callsign: `E2E-${suffix}`,
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
  await json(await request.post(`${apiBase}/api/missions/${mission.id}/waypoints`, {
    data: {
      vehicle_id: vehicle.id,
      sequence: 0,
      latitude: 34.152,
      longitude: -118.24,
      altitude_m: 105,
      arrival_radius_m: 10,
      action: "SURVEY",
    },
  }));

  await page.goto(`/missions/${mission.id}/plan`);
  await expect(page.getByText(`E2E-${suffix}`)).toBeVisible();
  await page.getByRole("button", { name: "Start simulation" }).click();
  await expect(page).toHaveURL(/\/runs\/[^/]+\/live/, { timeout: 15_000 });
  const runId = page.url().match(/\/runs\/([^/]+)\/live/)?.[1];
  expect(runId).toBeTruthy();
  await expect(page.getByText("Vehicle detail")).toBeVisible();

  await page.getByRole("button", { name: "Start simulation" }).click();
  await expect(page.getByRole("button", { name: "Inject failure" })).toBeEnabled();
  await page.getByRole("button", { name: "Inject failure" }).click();
  await expect.poll(async () => (await request.get(`${apiBase}/api/runs/${runId}`)).json(), { timeout: 60_000 })
    .toMatchObject({ status: "COMPLETED" });

  await page.goto(`/runs/${runId}/replay`);
  await expect(page.getByText("Historical mission")).toBeVisible();
  await expect(page.getByText(/Samples loaded/)).toBeVisible();

  await page.goto(`/runs/${runId}/debrief`);
  await expect(page.getByText("Operational summary")).toBeVisible();
  await page.getByRole("button", { name: "Generate debrief" }).click();
  await expect(page.getByText("Mission Summary")).toBeVisible({ timeout: 15_000 });
});
