"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import * as maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { createFailure, failureTypes, getRun, pauseRun, resumeRun, Run, startRun, stopRun, FailureType } from "@/lib/api";
import { LiveEvent, MissionState, VehicleTelemetry, useLiveTelemetry } from "@/stores/live-telemetry";

const envelopeSchema = z.object({
  event_id: z.string(),
  vehicle_id: z.string().nullable().optional(),
  sequence: z.number().nullable().optional(),
  sim_time_ms: z.number(),
  type: z.string(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
  payload: z.record(z.string(), z.unknown()),
});

function asNumber(value: unknown, fallback = 0): number { return typeof value === "number" ? value : fallback; }
function asString(value: unknown, fallback = "IDLE"): string { return typeof value === "string" ? value : fallback; }

function LiveMap({ vehicles, selectedVehicleId, onSelect }: { vehicles: Record<string, VehicleTelemetry>; selectedVehicleId: string | null; onSelect: (id: string) => void }) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Record<string, maplibregl.Marker>>({});
  useEffect(() => {
    if (!node.current || map.current) return;
    const instance = new maplibregl.Map({ container: node.current, style: "https://tiles.openfreemap.org/styles/liberty", center: [-118.24, 34.15], zoom: 10 });
    instance.addControl(new maplibregl.NavigationControl(), "top-right");
    map.current = instance;
    return () => { instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    for (const [vehicleId, telemetry] of Object.entries(vehicles)) {
      const marker = markers.current[vehicleId] ?? new maplibregl.Marker({ color: telemetry.communicationsState === "HEALTHY" ? "#53c7a3" : "#f0b45b" }).addTo(instance);
      marker.setLngLat([telemetry.longitude, telemetry.latitude]).setPopup(new maplibregl.Popup().setText(vehicleId));
      const markerElement = marker.getElement();
      let heading = markerElement.querySelector<HTMLElement>(".sentinel-marker-heading");
      if (!heading) {
        heading = document.createElement("span");
        heading.className = "sentinel-marker-heading";
        heading.textContent = "▲";
        markerElement.appendChild(heading);
      }
      heading.style.transform = `rotate(${telemetry.headingDeg}deg)`;
      marker.getElement().onclick = () => onSelect(vehicleId);
      markers.current[vehicleId] = marker;
    }
    for (const [vehicleId, marker] of Object.entries(markers.current)) {
      if (!vehicles[vehicleId]) { marker.remove(); delete markers.current[vehicleId]; }
      else marker.getElement().style.opacity = selectedVehicleId && selectedVehicleId !== vehicleId ? "0.55" : "1";
    }
  }, [vehicles, selectedVehicleId, onSelect]);
  return <div className="map-canvas" ref={node} />;
}

function telemetryFromEnvelope(value: z.infer<typeof envelopeSchema>): VehicleTelemetry | null {
  if (value.type !== "vehicle.telemetry" || !value.vehicle_id || value.sequence === null || value.sequence === undefined) return null;
  const payload = value.payload;
  return {
    vehicleId: value.vehicle_id,
    sequence: value.sequence,
    simTimeMs: value.sim_time_ms,
    latitude: asNumber(payload.latitude), longitude: asNumber(payload.longitude), altitudeM: asNumber(payload.altitude_m),
    headingDeg: asNumber(payload.heading_deg), groundSpeedMps: asNumber(payload.ground_speed_mps), batteryPercent: asNumber(payload.battery_percent),
    gpsQualityPercent: asNumber(payload.gps_quality_percent, 100), sensorStatus: asString(payload.sensor_status, "AVAILABLE"),
    missionState: asString(payload.mission_state) as MissionState,
    communicationsState: asString(payload.communications_state, "HEALTHY") as VehicleTelemetry["communicationsState"],
  };
}

export function LiveOperations({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [failureType, setFailureType] = useState<FailureType>("COMMUNICATIONS_BLACKOUT");
  const [failureDuration, setFailureDuration] = useState(10);
  const { vehicles, events, connection, selectedVehicleId, duplicates, missing, outOfOrder, setConnection, selectVehicle, ingestTelemetry, ingestEvent, reset } = useLiveTelemetry();
  useEffect(() => { reset(); getRun(runId).then(setRun).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load run")); return reset; }, [runId, reset]);
  useEffect(() => {
    const wsBase = process.env.NEXT_PUBLIC_WS_BASE_URL ?? "ws://localhost:8000";
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    let attempts = 0;

    const clearTimers = () => {
      if (retry) clearTimeout(retry);
      if (heartbeat) clearInterval(heartbeat);
      retry = undefined;
      heartbeat = undefined;
    };

    const connect = () => {
      if (disposed) return;
      setConnection(attempts > 0 ? "RECONNECTING" : "DISCONNECTED");
      try {
        socket = new WebSocket(`${wsBase}/ws/runs/${runId}`);
      } catch {
        setConnection("RECONNECTING");
        retry = setTimeout(connect, Math.min(10_000, 500 * 2 ** Math.min(attempts++, 5)));
        return;
      }
      socket.onopen = () => {
        attempts = 0;
        setConnection("LIVE");
        socket?.send(JSON.stringify({ type: "subscribe", topics: ["telemetry", "events", "metrics"] }));
        heartbeat = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
        }, 15_000);
      };
      socket.onmessage = (message) => {
        try {
          const parsed: unknown = JSON.parse(message.data as string);
          if (!parsed || typeof parsed !== "object" || !("data" in parsed)) return;
          const envelope = envelopeSchema.safeParse((parsed as { data: unknown }).data);
          if (!envelope.success) return;
          const telemetry = telemetryFromEnvelope(envelope.data);
          if (telemetry) ingestTelemetry(telemetry);
          if (!telemetry && envelope.data.type !== "vehicle.telemetry") ingestEvent({ eventId: envelope.data.event_id, type: envelope.data.type, severity: envelope.data.severity ?? "INFO", vehicleId: envelope.data.vehicle_id ?? null, simTimeMs: envelope.data.sim_time_ms, payload: envelope.data.payload });
        } catch { setError("Received an invalid realtime message"); }
      };
      socket.onclose = () => {
        clearTimers();
        if (disposed) {
          setConnection("DISCONNECTED");
          return;
        }
        setConnection("RECONNECTING");
        const delay = Math.min(10_000, 500 * 2 ** Math.min(attempts++, 5));
        retry = setTimeout(connect, delay);
      };
      socket.onerror = () => setConnection("RECONNECTING");
    };

    connect();
    return () => {
      disposed = true;
      clearTimers();
      socket?.close();
      setConnection("DISCONNECTED");
    };
  }, [runId, ingestEvent, ingestTelemetry, setConnection]);

  const command = async (action: "start" | "pause" | "resume" | "stop") => {
    setStarting(true); setError(null);
    try {
      const commandResult = action === "start" ? startRun(runId) : action === "pause" ? pauseRun(runId) : action === "resume" ? resumeRun(runId) : stopRun(runId);
      setRun(await commandResult);
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : `Unable to ${action} run`); }
    finally { setStarting(false); }
  };
  const elapsedMs = Math.max(0, ...Object.values(vehicles).map((vehicle) => vehicle.simTimeMs));
  const selected = selectedVehicleId ? vehicles[selectedVehicleId] : Object.values(vehicles)[0];
  if (!run) return <main className="main"><div className="card">{error ?? "Loading run…"}</div></main>;
  const inject = async () => {
    const vehicleId = selectedVehicleId ?? run.vehicles[0]?.id;
    if (!vehicleId) return;
    setError(null);
    try { await createFailure(runId, { vehicle_id: vehicleId, failure_type: failureType, duration_ms: failureDuration * 1000 }); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Unable to inject failure"); }
  };
  return <main className="main"><div className="planner-heading"><div><div className="eyebrow">Live operations / {runId}</div><h1>Mission run</h1><div className="status" aria-label={`Run status ${run.status}`}>● {run.status} · {elapsedMs} ms</div></div><div className="actions compact">{run.status === "READY" && <button className="button primary" disabled={starting} onClick={() => command("start")}>{starting ? "Starting…" : "Start simulation"}</button>}{run.status === "RUNNING" && <><button className="button" disabled={starting} onClick={() => command("pause")}>Pause</button><button className="button" disabled={starting} onClick={() => command("stop")}>Stop</button></>}{run.status === "PAUSED" && <><button className="button primary" disabled={starting} onClick={() => command("resume")}>Resume</button><button className="button" disabled={starting} onClick={() => command("stop")}>Stop</button></>}</div></div>{error && <div className="notice error">{error}</div>}<div className="workspace"><aside className="rail"><div className="eyebrow">Fleet · {connection}</div><div className="list">{run.vehicles.map((vehicle) => { const telemetry = vehicles[vehicle.id]; return <button className={`list-item selectable ${selectedVehicleId === vehicle.id ? "selected" : ""}`} key={vehicle.id} onClick={() => selectVehicle(vehicle.id)}><strong>{vehicle.callsign}</strong><span>{telemetry?.missionState ?? run.status} · {telemetry?.communicationsState ?? "—"}</span></button>; })}</div><div className="metric"><span>Duplicates</span><strong>{duplicates}</strong></div><div className="metric"><span>Missing</span><strong>{missing}</strong></div><div className="metric"><span>Out of order</span><strong>{outOfOrder}</strong></div></aside><section className="map-shell"><LiveMap vehicles={vehicles} selectedVehicleId={selectedVehicleId} onSelect={selectVehicle} /><div className="map-hint">WebSocket · {connection}</div></section><aside className="inspector"><div className="eyebrow">Vehicle detail</div>{selected ? <><div className="metric"><span>State</span><strong>{selected.missionState}</strong></div><div className="metric"><span>Battery</span><strong>{selected.batteryPercent.toFixed(1)}%</strong></div><div className="metric"><span>Altitude</span><strong>{selected.altitudeM.toFixed(1)} m</strong></div><div className="metric"><span>Speed</span><strong>{selected.groundSpeedMps.toFixed(1)} m/s</strong></div><div className="metric"><span>GPS quality</span><strong>{selected.gpsQualityPercent.toFixed(0)}%</strong></div><div className="metric"><span>Sensor</span><strong>{selected.sensorStatus}</strong></div><div className="metric"><span>Sequence</span><strong>{selected.sequence}</strong></div></> : <p className="card-copy">Waiting for telemetry.</p>}<div className="failure-panel"><div className="eyebrow">Simulation controls</div><label className="field">Failure<select value={failureType} onChange={(event) => setFailureType(event.target.value as FailureType)}>{failureTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label><label className="field">Duration (seconds)<input type="number" min={1} max={900} value={failureDuration} onChange={(event) => setFailureDuration(Number(event.target.value))} /></label><button className="button" disabled={run.status !== "RUNNING"} onClick={inject}>Inject failure</button></div><div className="eyebrow" style={{ marginTop: 28 }}>Live events</div><div className="events">{events.slice(0, 8).map((event: LiveEvent) => <div className={`event ${event.severity.toLowerCase()}`} key={event.eventId}><strong>{event.type}</strong><span>{event.vehicleId ?? "SYSTEM"} · {event.simTimeMs} ms</span></div>)}</div></aside></div></main>;
}
