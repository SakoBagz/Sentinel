"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import * as maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { createFailure, failureTypes, getMetrics, getMission, getRun, getRunSnapshot, Mission, pauseRun, resumeRun, Run, RunMetrics, startRun, stopRun, FailureType } from "@/lib/api";
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

type LiveMapProps = {
  vehicles: Record<string, VehicleTelemetry>;
  history: Record<string, VehicleTelemetry[]>;
  plannedRoutes: Record<string, [number, number][]>;
  selectedVehicleId: string | null;
  onSelect: (id: string) => void;
};

function LiveMap({ vehicles, history, plannedRoutes, selectedVehicleId, onSelect }: LiveMapProps) {
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
      const marker = markers.current[vehicleId] ?? new maplibregl.Marker({ color: telemetry.communicationsState === "HEALTHY" ? "#53c7a3" : "#f0b45b" })
        .setLngLat([telemetry.longitude, telemetry.latitude])
        .addTo(instance);
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

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const updateLines = () => {
      if (!instance.isStyleLoaded()) return;
      const trails = Object.entries(history)
        .filter(([, samples]) => samples.length > 1)
        .map(([vehicleId, samples]) => ({
          type: "Feature" as const,
          properties: { vehicleId },
          geometry: { type: "LineString" as const, coordinates: samples.map((sample) => [sample.longitude, sample.latitude]) },
        }));
      const routes = Object.entries(plannedRoutes)
        .filter(([, coordinates]) => coordinates.length > 1)
        .map(([vehicleId, coordinates]) => ({
          type: "Feature" as const,
          properties: { vehicleId },
          geometry: { type: "LineString" as const, coordinates },
        }));
      for (const [sourceId, data] of [["sentinel-live-trails", trails], ["sentinel-planned-routes", routes]] as const) {
        const source = instance.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (source) source.setData({ type: "FeatureCollection", features: data } as GeoJSON.FeatureCollection);
        else {
          instance.addSource(sourceId, { type: "geojson", data: { type: "FeatureCollection", features: data } });
          instance.addLayer({
            id: `${sourceId}-line`,
            type: "line",
            source: sourceId,
            paint: { "line-color": sourceId === "sentinel-planned-routes" ? "#8b9bad" : "#53c7a3", "line-width": 2, "line-opacity": sourceId === "sentinel-planned-routes" ? 0.65 : 0.85 },
          });
        }
      }
    };
    if (instance.isStyleLoaded()) updateLines();
    else instance.once("load", updateLines);
    return () => { instance.off("load", updateLines); };
  }, [history, plannedRoutes]);
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

function telemetryFromSnapshot(value: NonNullable<Awaited<ReturnType<typeof getRunSnapshot>>["vehicles"][number]["telemetry"]>): VehicleTelemetry {
  return {
    vehicleId: value.vehicle_id,
    sequence: value.sequence,
    simTimeMs: value.sim_time_ms,
    latitude: value.latitude ?? 0,
    longitude: value.longitude ?? 0,
    altitudeM: value.altitude_m ?? 0,
    headingDeg: value.heading_deg ?? 0,
    groundSpeedMps: value.ground_speed_mps ?? 0,
    batteryPercent: value.battery_percent ?? 0,
    gpsQualityPercent: 100,
    sensorStatus: "AVAILABLE",
    missionState: asString(value.mission_state) as MissionState,
    communicationsState: asString(value.communications_state, "HEALTHY") as VehicleTelemetry["communicationsState"],
  };
}

function OperationalDiagnostics({
  metrics,
  metricsError,
  connection,
  duplicates,
  missing,
  outOfOrder,
}: {
  metrics: RunMetrics | null;
  metricsError: string | null;
  connection: string;
  duplicates: number;
  missing: number;
  outOfOrder: number;
}) {
  return <section className="card diagnostics-card" aria-label="Operational diagnostics">
    <div className="diagnostics-header"><div><div className="eyebrow">Operational diagnostics</div><h2>Control-plane health</h2></div><span className={`diagnostics-badge ${metrics ? "ready" : "warning"}`}><span className="status-dot" />{metrics ? "Durable metrics" : "Awaiting persistence"}</span></div>
    <div className="diagnostic-grid">
      <div className="metric"><span>Persisted telemetry</span><strong>{metrics?.telemetry_messages_received.toLocaleString() ?? "—"}</strong></div>
      <div className="metric"><span>Telemetry rate</span><strong>{metrics ? `${metrics.telemetry_throughput_per_second.toFixed(1)} msg/s` : "—"}</strong></div>
      <div className="metric"><span>p95 delivery latency</span><strong>{metrics ? `${metrics.latency_p95_ms.toFixed(1)} ms` : "—"}</strong></div>
      <div className="metric"><span>Comms availability</span><strong>{metrics ? `${metrics.communications_availability_percent.toFixed(1)}%` : "—"}</strong></div>
    </div>
    <div className="diagnostic-foot"><span>WebSocket <strong>{connection}</strong></span><span>Browser gaps <strong>{missing}</strong></span><span>Duplicates <strong>{duplicates}</strong></span><span>Out of order <strong>{outOfOrder}</strong></span></div>
    {metricsError && <div className="notice">Durable metrics are temporarily unavailable; the live telemetry stream remains active.</div>}
  </section>;
}

export function LiveOperations({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [plannedRoutes, setPlannedRoutes] = useState<Record<string, [number, number][]>>({});
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [failureType, setFailureType] = useState<FailureType>("COMMUNICATIONS_BLACKOUT");
  const [failureDuration, setFailureDuration] = useState(10);
  const [fleetSearch, setFleetSearch] = useState("");
  const [eventSeverityFilter, setEventSeverityFilter] = useState<"ALL" | LiveEvent["severity"]>("ALL");
  const [eventSearch, setEventSearch] = useState("");
  const [warningsFirst, setWarningsFirst] = useState(true);
  const { vehicles, history, events, connection, selectedVehicleId, duplicates, missing, outOfOrder, setConnection, selectVehicle, ingestTelemetry, hydrateTelemetry, ingestEvent, reset } = useLiveTelemetry();
  const metricsLive = run?.status === "READY" || run?.status === "RUNNING" || run?.status === "PAUSED";
  useEffect(() => {
    reset();
    getRun(runId).then(async (loadedRun) => {
      setRun(loadedRun);
      try {
        const mission: Mission = await getMission(loadedRun.mission_id);
        const runVehicleByDefinition = new Map(loadedRun.vehicles.map((vehicle) => [vehicle.vehicle_definition_id, vehicle.id]));
        const missionVehicleToRunVehicle = new Map(mission.vehicles.map((vehicle) => [vehicle.id, runVehicleByDefinition.get(vehicle.vehicle_definition_id)]));
        const routes: Record<string, [number, number][]> = {};
        for (const waypoint of mission.waypoints) {
          const runVehicleId = waypoint.vehicle_id ? missionVehicleToRunVehicle.get(waypoint.vehicle_id) : undefined;
          if (!runVehicleId) continue;
          (routes[runVehicleId] ??= []).push([waypoint.longitude, waypoint.latitude]);
        }
        setPlannedRoutes(routes);
      } catch { /* a run can still be observed if its mission definition is unavailable */ }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load run"));
    return reset;
  }, [runId, reset]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const value = await getMetrics(runId);
        if (active) {
          setMetrics(value);
          setMetricsError(null);
        }
      } catch (reason: unknown) {
        if (active) setMetricsError(reason instanceof Error ? reason.message : "Unable to load durable metrics");
      } finally {
        if (active && metricsLive) timer = setTimeout(refresh, 5_000);
      }
    };
    void refresh();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [runId, metricsLive]);
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
        getRunSnapshot(runId).then((snapshot) => {
          for (const item of snapshot.vehicles) {
            if (item.telemetry) hydrateTelemetry(telemetryFromSnapshot(item.telemetry));
          }
        }).catch(() => { /* live stream remains the primary path */ });
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
          if (!telemetry && envelope.data.type !== "vehicle.telemetry") {
            ingestEvent({ eventId: envelope.data.event_id, type: envelope.data.type, severity: envelope.data.severity ?? "INFO", vehicleId: envelope.data.vehicle_id ?? null, simTimeMs: envelope.data.sim_time_ms, payload: envelope.data.payload });
            if (["mission.started", "mission.paused", "mission.resumed", "mission.completed", "mission.aborted"].includes(envelope.data.type)) {
              getRun(runId).then(setRun).catch(() => { /* telemetry remains visible if status refresh fails */ });
            }
          }
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
  }, [runId, hydrateTelemetry, ingestEvent, ingestTelemetry, setConnection]);

  const command = async (action: "start" | "pause" | "resume" | "stop") => {
    setStarting(true); setError(null);
    try {
      const commandResult = action === "start" ? startRun(runId) : action === "pause" ? pauseRun(runId) : action === "resume" ? resumeRun(runId) : stopRun(runId);
      setRun(await commandResult);
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : `Unable to ${action} run`); }
    finally { setStarting(false); }
  };
  const elapsedMs = Math.max(0, ...Object.values(vehicles).map((vehicle) => vehicle.simTimeMs));
  const visibleVehicles = run?.vehicles.filter((vehicle) => vehicle.callsign.toLowerCase().includes(fleetSearch.toLowerCase())) ?? [];
  const visibleEvents = [...events]
    .filter((event) => eventSeverityFilter === "ALL" || event.severity === eventSeverityFilter)
    .filter((event) => !eventSearch || `${event.type} ${event.vehicleId ?? ""}`.toLowerCase().includes(eventSearch.toLowerCase()))
    .sort((left, right) => warningsFirst ? ({ CRITICAL: 0, WARNING: 1, INFO: 2 }[left.severity] - { CRITICAL: 0, WARNING: 1, INFO: 2 }[right.severity]) || right.simTimeMs - left.simTimeMs : right.simTimeMs - left.simTimeMs);
  const selected = selectedVehicleId ? vehicles[selectedVehicleId] : Object.values(vehicles)[0];
  if (!run) return <main className="main"><div className="card">{error ?? "Loading run…"}</div></main>;
  const inject = async () => {
    const vehicleId = selected?.vehicleId ?? run.vehicles[0]?.id;
    if (!vehicleId) return;
    setError(null);
    try { await createFailure(runId, { vehicle_id: vehicleId, failure_type: failureType, duration_ms: failureDuration * 1000 }); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Unable to inject failure"); }
  };
  return <main className="main"><div className="planner-heading"><div><div className="eyebrow">Live operations / {runId}</div><h1>Mission run</h1><div className="status" aria-label={`Run status ${run.status}`}>● {run.status} · {elapsedMs} ms</div></div><div className="actions compact">{run.status === "READY" && <button className="button primary" disabled={starting} onClick={() => command("start")}>{starting ? "Starting…" : "Start simulation"}</button>}{run.status === "RUNNING" && <><button className="button" disabled={starting} onClick={() => command("pause")}>Pause</button><button className="button" disabled={starting} onClick={() => command("stop")}>Stop</button></>}{run.status === "PAUSED" && <><button className="button primary" disabled={starting} onClick={() => command("resume")}>Resume</button><button className="button" disabled={starting} onClick={() => command("stop")}>Stop</button></>}</div></div>{error && <div className="notice error">{error}</div>}<OperationalDiagnostics metrics={metrics} metricsError={metricsError} connection={connection} duplicates={duplicates} missing={missing} outOfOrder={outOfOrder} /><div className="workspace"><aside className="rail"><div className="eyebrow">Fleet · {connection}</div><label className="field">Search fleet<input aria-label="Search fleet" value={fleetSearch} onChange={(event) => setFleetSearch(event.target.value)} placeholder="Callsign" /></label><div className="list">{visibleVehicles.map((vehicle) => { const telemetry = vehicles[vehicle.id]; return <button className={`list-item selectable ${selectedVehicleId === vehicle.id ? "selected" : ""}`} key={vehicle.id} onClick={() => selectVehicle(vehicle.id)}><strong>{vehicle.callsign}</strong><span>{telemetry?.missionState ?? run.status} · {telemetry?.communicationsState ?? "—"}</span></button>; })}</div><div className="metric"><span>Duplicates</span><strong>{duplicates}</strong></div><div className="metric"><span>Missing</span><strong>{missing}</strong></div><div className="metric"><span>Out of order</span><strong>{outOfOrder}</strong></div></aside><section className="map-shell"><LiveMap vehicles={vehicles} history={history} plannedRoutes={plannedRoutes} selectedVehicleId={selectedVehicleId} onSelect={selectVehicle} /><div className="map-hint">WebSocket · {connection}</div></section><aside className="inspector"><div className="eyebrow">Vehicle detail</div>{selected ? <><div className="metric"><span>State</span><strong>{selected.missionState}</strong></div><div className="metric"><span>Battery</span><strong>{selected.batteryPercent.toFixed(1)}%</strong></div><div className="metric"><span>Altitude</span><strong>{selected.altitudeM.toFixed(1)} m</strong></div><div className="metric"><span>Speed</span><strong>{selected.groundSpeedMps.toFixed(1)} m/s</strong></div><div className="metric"><span>GPS quality</span><strong>{selected.gpsQualityPercent.toFixed(0)}%</strong></div><div className="metric"><span>Sensor</span><strong>{selected.sensorStatus}</strong></div><div className="metric"><span>Sequence</span><strong>{selected.sequence}</strong></div></> : <p className="card-copy">Waiting for telemetry.</p>}<div className="failure-panel"><div className="eyebrow">Simulation controls</div><label className="field">Failure<select value={failureType} onChange={(event) => setFailureType(event.target.value as FailureType)}>{failureTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label><label className="field">Duration (seconds)<input type="number" min={1} max={900} value={failureDuration} onChange={(event) => setFailureDuration(Number(event.target.value))} /></label><button className="button" disabled={run.status !== "RUNNING"} onClick={inject}>Inject failure</button></div><div className="eyebrow" style={{ marginTop: 28 }}>Live events</div><label className="field">Filter events<input aria-label="Filter live events" value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Type or vehicle" /></label><label className="field">Severity<select aria-label="Event severity" value={eventSeverityFilter} onChange={(event) => setEventSeverityFilter(event.target.value as typeof eventSeverityFilter)}><option value="ALL">ALL</option><option value="CRITICAL">CRITICAL</option><option value="WARNING">WARNING</option><option value="INFO">INFO</option></select></label><button className="button" onClick={() => setWarningsFirst((value) => !value)}>{warningsFirst ? "Warnings first" : "Newest first"}</button><div className="events">{visibleEvents.slice(0, 40).map((event: LiveEvent) => <div className={`event ${event.severity.toLowerCase()}`} key={event.eventId}><strong>{event.type}</strong><span>{event.vehicleId ?? "SYSTEM"} · {event.simTimeMs} ms</span></div>)}</div></aside></div></main>;
}
