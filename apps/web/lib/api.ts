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
    throw new Error(body || `Request failed with ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  const value: unknown = await response.json();
  return schema ? schema.parse(value) : (value as T);
}

export async function listMissions(): Promise<Mission[]> {
  const value = await request<{ items: unknown[] }>("/api/missions");
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

export async function createRun(id: string, input: { random_seed?: number; simulation_speed?: number } = {}): Promise<Run> {
  return request(`/api/missions/${id}/runs`, { method: "POST", body: JSON.stringify(input) }, runSchema);
}

export async function getRun(id: string): Promise<Run> {
  return request(`/api/runs/${id}`, undefined, runSchema);
}

export async function startRun(id: string): Promise<Run> {
  return request(`/api/runs/${id}/start`, { method: "POST" }, runSchema);
}

