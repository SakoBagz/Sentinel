import { z } from "zod";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const vehicleSchema = z.object({
  id: z.string(),
  vehicle_definition_id: z.string(),
  callsign: z.string(),
  vehicle_type: z.string(),
  max_speed_mps: z.number(),
  cruise_speed_mps: z.number(),
  battery_capacity: z.number(),
  telemetry_rate_hz: z.number(),
  starting_latitude: z.number().nullable(),
  starting_longitude: z.number().nullable(),
  starting_altitude_m: z.number().nullable(),
  configuration: z.record(z.string(), z.unknown()),
});

export const waypointSchema = z.object({
  id: z.string(),
  mission_id: z.string(),
  vehicle_id: z.string().nullable(),
  sequence: z.number(),
  latitude: z.number(),
  longitude: z.number(),
  altitude_m: z.number(),
  target_speed_mps: z.number().nullable(),
  arrival_radius_m: z.number().nullable(),
  action: z.enum(["TRANSIT", "HOLD", "SURVEY", "RETURN"]),
});

export const missionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  scenario_type: z.string().nullable(),
  status: z.enum(["DRAFT", "READY", "RUNNING", "PAUSED", "COMPLETED", "ABORTED"]),
  created_at: z.string(),
  updated_at: z.string(),
  vehicles: z.array(vehicleSchema),
  waypoints: z.array(waypointSchema),
});

export type Mission = z.infer<typeof missionSchema>;
export type Vehicle = z.infer<typeof vehicleSchema>;
export type Waypoint = z.infer<typeof waypointSchema>;

const runVehicleSchema = z.object({
  id: z.string(),
  vehicle_definition_id: z.string(),
  callsign: z.string(),
  starting_latitude: z.number().nullable(),
  starting_longitude: z.number().nullable(),
  starting_altitude_m: z.number().nullable(),
});

export const runSchema = z.object({
  id: z.string(),
  mission_id: z.string(),
  status: z.enum(["READY", "RUNNING", "PAUSED", "COMPLETED", "ABORTED"]),
  random_seed: z.number(),
  simulation_speed: z.number(),
  configuration: z.record(z.string(), z.unknown()),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  vehicles: z.array(runVehicleSchema),
});

export type Run = z.infer<typeof runSchema>;

async function request<T>(path: string, init?: RequestInit, schema?: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    let message = body || `Request failed with ${response.status}`;
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      message = parsed.error?.message ?? message;
    } catch { /* keep the raw response for non-JSON errors */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  const value: unknown = await response.json();
  return schema ? schema.parse(value) : (value as T);
}

function browserSessionHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const key = "sentinel-session-id";
  let value = window.localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    window.localStorage.setItem(key, value);
  }
  return { "X-Session-Id": value };
}

export async function listMissions(cursor?: string): Promise<Mission[]> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const value = await request<{ items: unknown[] }>(`/api/missions${query}`);
  return z.array(missionSchema).parse(value.items);
}

export async function getMission(id: string): Promise<Mission> {
  return request(`/api/missions/${id}`, undefined, missionSchema);
}

export async function createMission(input: { name: string; description?: string; scenario_type?: string }): Promise<Mission> {
  return request("/api/missions", { method: "POST", body: JSON.stringify(input) }, missionSchema);
}

export async function updateMission(id: string, input: { name?: string; description?: string; scenario_type?: string }): Promise<Mission> {
  return request(`/api/missions/${id}`, { method: "PATCH", body: JSON.stringify(input) }, missionSchema);
}

export async function addVehicle(id: string, input: Record<string, unknown>): Promise<Vehicle> {
  return request(`/api/missions/${id}/vehicles`, { method: "POST", body: JSON.stringify(input) }, vehicleSchema);
}

export async function addWaypoint(id: string, input: Record<string, unknown>): Promise<Waypoint> {
  return request(`/api/missions/${id}/waypoints`, { method: "POST", body: JSON.stringify(input) }, waypointSchema);
}

export async function updateWaypoint(id: string, input: Record<string, unknown>): Promise<Waypoint> {
  return request(`/api/waypoints/${id}`, { method: "PATCH", body: JSON.stringify(input) }, waypointSchema);
}

export async function deleteWaypoint(id: string): Promise<void> {
  return request(`/api/waypoints/${id}`, { method: "DELETE" });
}

export async function createRun(id: string, input: { random_seed?: number; simulation_speed?: number; duration_limit_minutes?: number } = {}): Promise<Run> {
  return request(`/api/missions/${id}/runs`, { method: "POST", headers: browserSessionHeaders(), body: JSON.stringify(input) }, runSchema);
}

export async function launchDemo(): Promise<Run> {
  return request("/api/demo/launch", { method: "POST", headers: browserSessionHeaders() }, runSchema);
}

export async function getRun(id: string): Promise<Run> {
  return request(`/api/runs/${id}`, undefined, runSchema);
}

export async function getRunSnapshot(id: string): Promise<RunSnapshot> {
  return request(`/api/runs/${id}/snapshot`, undefined, runSnapshotSchema);
}

export async function startRun(id: string): Promise<Run> {
  return request(`/api/runs/${id}/start`, { method: "POST" }, runSchema);
}

export async function pauseRun(id: string): Promise<Run> {
  return request(`/api/runs/${id}/pause`, { method: "POST" }, runSchema);
}

export async function resumeRun(id: string): Promise<Run> {
  return request(`/api/runs/${id}/resume`, { method: "POST" }, runSchema);
}

export async function stopRun(id: string): Promise<Run> {
  return request(`/api/runs/${id}/stop`, { method: "POST" }, runSchema);
}

export const failureTypes = ["COMMUNICATIONS_BLACKOUT", "HIGH_LATENCY", "PACKET_LOSS", "GPS_QUALITY_DEGRADATION", "BATTERY_ANOMALY", "SENSOR_UNAVAILABLE", "SERVICE_DELAY"] as const;
export type FailureType = typeof failureTypes[number];

export async function createFailure(runId: string, input: { vehicle_id: string; failure_type: FailureType; duration_ms: number; configuration?: Record<string, unknown> }): Promise<unknown> {
  return request(`/api/runs/${runId}/failures`, { method: "POST", body: JSON.stringify(input) });
}

const telemetrySchema = z.object({
  id: z.number(), event_id: z.string(), run_id: z.string(), vehicle_id: z.string(), sequence: z.number(), sim_time_ms: z.number(), received_at: z.string(),
  latitude: z.number().nullable(), longitude: z.number().nullable(), altitude_m: z.number().nullable(), heading_deg: z.number().nullable(), ground_speed_mps: z.number().nullable(), battery_percent: z.number().nullable(), mission_state: z.string().nullable(), communications_state: z.string().nullable(),
});
const telemetryPageSchema = z.object({ items: z.array(telemetrySchema), next_cursor: z.string().nullable() });
const eventSchema = z.object({ id: z.string(), run_id: z.string(), vehicle_id: z.string().nullable(), event_type: z.string(), severity: z.string(), schema_version: z.number(), sim_time_ms: z.number(), timestamp: z.string(), payload: z.record(z.string(), z.unknown()) });
const eventPageSchema = z.object({ items: z.array(eventSchema), next_cursor: z.string().nullable() });
const snapshotVehicleSchema = z.object({ id: z.string(), callsign: z.string(), telemetry: telemetrySchema.nullable() });
const runSnapshotSchema = z.object({ run_id: z.string(), sim_time_ms: z.number(), vehicles: z.array(snapshotVehicleSchema) });
export type RunSnapshot = z.infer<typeof runSnapshotSchema>;
const metricsSchema = z.object({ run_id: z.string(), telemetry_messages_received: z.number(), telemetry_sequences_missing: z.number(), telemetry_sequences_duplicate: z.number(), telemetry_sequences_out_of_order: z.number(), event_count: z.number(), warning_count: z.number(), critical_count: z.number(), vehicle_count: z.number(), completed_vehicle_count: z.number(), mission_duration_ms: z.number(), communications_availability_percent: z.number(), telemetry_throughput_per_second: z.number(), latency_p50_ms: z.number(), latency_p95_ms: z.number(), latency_p99_ms: z.number() });
export type TelemetrySample = z.infer<typeof telemetrySchema>;
export type MissionEvent = z.infer<typeof eventSchema>;
export type RunMetrics = z.infer<typeof metricsSchema>;

const analystEvidenceSchema = z.object({ event_id: z.string(), vehicle_id: z.string().nullable(), sim_time_ms: z.number() });
const analystSchema = z.object({ run_id: z.string(), answer: z.string(), confidence: z.enum(["high", "medium", "low"]), evidence: z.array(analystEvidenceSchema), limitations: z.array(z.string()), provider: z.string(), model: z.string().nullable(), sections: z.record(z.string(), z.string()) });
export type AnalystResponse = z.infer<typeof analystSchema>;

export async function getReplay(runId: string, startMs = 0, endMs?: number): Promise<TelemetrySample[]> {
  const query = new URLSearchParams({ start_ms: String(startMs), limit: "5000" });
  if (endMs !== undefined) query.set("end_ms", String(endMs));
  const page = await request(`/api/runs/${runId}/replay?${query.toString()}`, undefined, telemetryPageSchema);
  return page.items;
}

export async function getEvents(runId: string): Promise<MissionEvent[]> {
  const page = await request(`/api/runs/${runId}/events?limit=2000`, undefined, eventPageSchema);
  return page.items;
}

export async function getMetrics(runId: string): Promise<RunMetrics> {
  return request(`/api/runs/${runId}/metrics`, undefined, metricsSchema);
}

export async function askAnalyst(runId: string, message: string): Promise<AnalystResponse> {
  return request(`/api/runs/${runId}/assistant`, { method: "POST", headers: browserSessionHeaders(), body: JSON.stringify({ message }) }, analystSchema);
}

export async function getDebrief(runId: string): Promise<AnalystResponse> {
  return request(`/api/runs/${runId}/debrief`, { method: "POST", headers: browserSessionHeaders() }, analystSchema);
}
