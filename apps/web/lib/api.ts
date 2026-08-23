import { z } from "zod";

import type { MissionScenario } from "@/lib/mission-catalog";

// Empty/default keeps browser calls same-origin so Next can proxy to the API
// (works for local split processes and Cursor/cloud port forwarding).
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const TOKEN_KEY = "sentinel-access-token";
const ROLE_KEY = "sentinel-role";
const SUBJECT_KEY = "sentinel-subject";

const authSessionSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  role: z.enum(["operator", "observer"]),
  subject: z.string(),
  expires_at: z.string(),
});

export type AuthSession = z.infer<typeof authSessionSchema>;

let memoryToken: string | null = null;
let sessionPromise: Promise<string> | null = null;

function readStoredToken(): string | null {
  if (typeof window === "undefined") return memoryToken;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getAccessToken(): string | null {
  return readStoredToken();
}

export function clearAuthSession(): void {
  memoryToken = null;
  sessionPromise = null;
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(ROLE_KEY);
  window.localStorage.removeItem(SUBJECT_KEY);
}

function storeSession(session: AuthSession): void {
  memoryToken = session.access_token;
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, session.access_token);
  window.localStorage.setItem(ROLE_KEY, session.role);
  window.localStorage.setItem(SUBJECT_KEY, session.subject);
}

export async function ensureAuthSession(role: "operator" | "observer" = "operator"): Promise<string> {
  const existing = readStoredToken();
  if (existing) return existing;
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const response = await fetch(`${apiBase}/api/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        throw new Error("Unable to establish a Sentinel operator session");
      }
      const session = authSessionSchema.parse(await response.json());
      storeSession(session);
      return session.access_token;
    })().finally(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

async function authHeaders(extra?: HeadersInit): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (extra) {
    const normalized = new Headers(extra);
    normalized.forEach((value, key) => {
      headers[key] = value;
    });
  }
  try {
    const token = await ensureAuthSession("operator");
    headers.Authorization = `Bearer ${token}`;
  } catch {
    /* read-only callers may still proceed without a token for public GETs */
  }
  return headers;
}

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

const auditEventSchema = z.object({
  id: z.string(),
  actor_subject: z.string(),
  actor_role: z.string(),
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

async function request<T>(path: string, init?: RequestInit, schema?: z.ZodType<T>): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const retryDelays = method === "GET" || method === "HEAD" ? [0, 300, 900] : [0];
  let response: Response | undefined;
  const headers = await authHeaders(init?.headers);
  for (const delay of retryDelays) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      response = await fetch(`${apiBase}${path}`, {
        ...init,
        headers,
      });
      break;
    } catch {
      if (init?.signal?.aborted) throw new Error("The request was cancelled.");
    }
  }
  if (!response) {
    throw new Error(
      `Sentinel API is unavailable${apiBase ? ` at ${apiBase}` : ""}. Start the local services and try again.`,
    );
  }
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

export async function listMissions(cursor?: string): Promise<Mission[]> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const value = await request<{ items: unknown[] }>(`/api/missions${query}`);
  return z.array(missionSchema).parse(value.items);
}

export async function getMission(id: string): Promise<Mission> {
  return request(`/api/missions/${id}`, undefined, missionSchema);
}

export async function createMission(input: { name: string; description?: string; scenario_type?: MissionScenario }): Promise<Mission> {
  return request("/api/missions", { method: "POST", body: JSON.stringify(input) }, missionSchema);
}

export async function updateMission(id: string, input: { name?: string; description?: string; scenario_type?: MissionScenario }): Promise<Mission> {
  return request(`/api/missions/${id}`, { method: "PATCH", body: JSON.stringify(input) }, missionSchema);
}

export async function addVehicle(id: string, input: Record<string, unknown>): Promise<Vehicle> {
  return request(`/api/missions/${id}/vehicles`, { method: "POST", body: JSON.stringify(input) }, vehicleSchema);
}

export async function addWaypoint(id: string, input: Record<string, unknown>): Promise<Waypoint> {
  return request(`/api/missions/${id}/waypoints`, { method: "POST", body: JSON.stringify(input) }, waypointSchema);
}

export async function generatePattern(
  missionId: string,
  input: {
    pattern: "lawnmower" | "expanding_square";
    vehicle_id: string;
    center_latitude: number;
    center_longitude: number;
    altitude_m?: number;
    spacing_m?: number;
    legs?: number;
    leg_length_m?: number;
  },
): Promise<Waypoint[]> {
  return request(`/api/missions/${missionId}/patterns`, { method: "POST", body: JSON.stringify(input) }, z.array(waypointSchema));
}

export async function updateWaypoint(id: string, input: Record<string, unknown>): Promise<Waypoint> {
  return request(`/api/waypoints/${id}`, { method: "PATCH", body: JSON.stringify(input) }, waypointSchema);
}

export async function deleteWaypoint(id: string): Promise<void> {
  return request(`/api/waypoints/${id}`, { method: "DELETE" });
}

export async function createRun(id: string, input: { random_seed?: number; simulation_speed?: number; duration_limit_minutes?: number } = {}): Promise<Run> {
  return request(`/api/missions/${id}/runs`, { method: "POST", body: JSON.stringify(input) }, runSchema);
}

export async function launchDemo(): Promise<Run> {
  return request("/api/demo/launch", { method: "POST" }, runSchema);
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
const metricsSchema = z.object({ run_id: z.string(), telemetry_messages_received: z.number(), telemetry_messages_generated: z.number(), telemetry_messages_delivered: z.number(), telemetry_messages_unique_delivered: z.number(), telemetry_messages_persisted: z.number(), telemetry_sequences_missing: z.number(), telemetry_sequences_duplicate: z.number(), telemetry_sequences_out_of_order: z.number(), telemetry_loss_percent: z.number(), telemetry_healthy_delivered: z.number(), event_count: z.number(), warning_count: z.number(), critical_count: z.number(), vehicle_count: z.number(), completed_vehicle_count: z.number(), mission_duration_ms: z.number(), communications_availability_percent: z.number(), telemetry_throughput_per_second: z.number(), latency_p50_ms: z.number(), latency_p95_ms: z.number(), latency_p99_ms: z.number(), simulated_mission_duration_ms: z.number(), persistence_queue_high_water_mark: z.number() });
export type TelemetrySample = z.infer<typeof telemetrySchema>;
export type MissionEvent = z.infer<typeof eventSchema>;
export type RunMetrics = z.infer<typeof metricsSchema>;

const analystEvidenceSchema = z.object({ event_id: z.string(), vehicle_id: z.string().nullable(), sim_time_ms: z.number() });
const analystSchema = z.object({ run_id: z.string(), answer: z.string(), confidence: z.enum(["high", "medium", "low"]), evidence: z.array(analystEvidenceSchema), limitations: z.array(z.string()), provider: z.string(), model: z.string().nullable(), sections: z.record(z.string(), z.string()) });
export type AnalystResponse = z.infer<typeof analystSchema>;

export async function getReplay(runId: string, startMs = 0, endMs?: number): Promise<TelemetrySample[]> {
  const query = new URLSearchParams({ start_ms: String(startMs), limit: "5000", downsample: "true" });
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

export async function getAuditEvents(resourceType?: string, resourceId?: string): Promise<AuditEvent[]> {
  const query = new URLSearchParams({ limit: "100" });
  if (resourceType) query.set("resource_type", resourceType);
  if (resourceId) query.set("resource_id", resourceId);
  return request(`/api/audit/events?${query.toString()}`, undefined, z.array(auditEventSchema));
}

export async function askAnalyst(runId: string, message: string): Promise<AnalystResponse> {
  return request(`/api/runs/${runId}/assistant`, { method: "POST", body: JSON.stringify({ message }) }, analystSchema);
}

export async function getDebrief(runId: string): Promise<AnalystResponse> {
  return request(`/api/runs/${runId}/debrief`, { method: "POST" }, analystSchema);
}
