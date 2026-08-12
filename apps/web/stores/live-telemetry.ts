import { create } from "zustand";

export type CommunicationsState = "HEALTHY" | "DEGRADED" | "STALE" | "DISCONNECTED" | "RECOVERING";
export type MissionState = "IDLE" | "READY" | "LAUNCHING" | "TRANSIT" | "EXECUTING" | "RETURNING" | "LANDED" | "COMPLETE" | "PAUSED" | "ABORTED";

export type VehicleTelemetry = {
  vehicleId: string;
  sequence: number;
  simTimeMs: number;
  latitude: number;
  longitude: number;
  altitudeM: number;
  headingDeg: number;
  groundSpeedMps: number;
  batteryPercent: number;
  gpsQualityPercent: number;
  sensorStatus: string;
  missionState: MissionState;
  communicationsState: CommunicationsState;
};

export type LiveEvent = {
  eventId: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  vehicleId: string | null;
  simTimeMs: number;
  payload: Record<string, unknown>;
};

type LiveTelemetryState = {
  vehicles: Record<string, VehicleTelemetry>;
  history: Record<string, VehicleTelemetry[]>;
  events: LiveEvent[];
  duplicates: number;
  missing: number;
  outOfOrder: number;
  connection: "LIVE" | "RECONNECTING" | "DISCONNECTED";
  selectedVehicleId: string | null;
  setConnection: (connection: LiveTelemetryState["connection"]) => void;
  selectVehicle: (vehicleId: string | null) => void;
  ingestTelemetry: (telemetry: VehicleTelemetry) => void;
  hydrateTelemetry: (telemetry: VehicleTelemetry) => void;
  ingestEvent: (event: LiveEvent) => void;
  reset: () => void;
};

const initialState = {
  vehicles: {},
  history: {},
  events: [],
  duplicates: 0,
  missing: 0,
  outOfOrder: 0,
  connection: "DISCONNECTED" as const,
  selectedVehicleId: null,
};

export const useLiveTelemetry = create<LiveTelemetryState>((set) => ({
  ...initialState,
  setConnection: (connection) => set({ connection }),
  selectVehicle: (selectedVehicleId) => set({ selectedVehicleId }),
  ingestTelemetry: (telemetry) => set((state) => {
    const previous = state.vehicles[telemetry.vehicleId];
    const priorHistory = state.history[telemetry.vehicleId] ?? [];
    if (!previous) return { vehicles: { ...state.vehicles, [telemetry.vehicleId]: telemetry }, history: { ...state.history, [telemetry.vehicleId]: [telemetry] } };
    if (telemetry.sequence === previous.sequence) return { duplicates: state.duplicates + 1 };
    if (telemetry.sequence < previous.sequence) return { outOfOrder: state.outOfOrder + 1 };
    return {
      vehicles: { ...state.vehicles, [telemetry.vehicleId]: telemetry },
      history: { ...state.history, [telemetry.vehicleId]: [...priorHistory, telemetry].slice(-30) },
      missing: state.missing + Math.max(0, telemetry.sequence - previous.sequence - 1),
    };
  }),
  hydrateTelemetry: (telemetry) => set((state) => {
    const previous = state.vehicles[telemetry.vehicleId];
    if (previous && previous.sequence >= telemetry.sequence) return state;
    const priorHistory = state.history[telemetry.vehicleId] ?? [];
    return { vehicles: { ...state.vehicles, [telemetry.vehicleId]: telemetry }, history: { ...state.history, [telemetry.vehicleId]: [...priorHistory, telemetry].slice(-30) } };
  }),
  ingestEvent: (event) => set((state) => ({ events: [event, ...state.events].slice(0, 200) })),
  reset: () => set(initialState),
}));
