"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Marker, Popup, type Map as MapLibreMap } from "maplibre-gl";
import { Pause, Play, Radio, Search, Square, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { AuditPanel } from "@/components/audit-panel";
import { PageHeader } from "@/components/page-header";
import { RunNavigation } from "@/components/run-navigation";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { VehicleInspectField } from "@/components/vehicle-inspect-field";
import { createFailure, ensureAuthSession, failureTypes, getMetrics, getMission, getRun, getRunSnapshot, Mission, pauseRun, resumeRun, Run, RunMetrics, startRun, stopRun, FailureType } from "@/lib/api";
import { createOpsMap, makeMarkerInteractive, setMarkerSelected, updateLineGeoJson, updateMarkerHeading, updateWhenStyleReady, type OpsLine } from "@/lib/ops-map";
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
  callsigns: Record<string, string>;
  selectedVehicleId: string | null;
  onSelect: (id: string) => void;
};

function LiveMap({ vehicles, history, plannedRoutes, callsigns, selectedVehicleId, onSelect }: LiveMapProps) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Record<string, Marker>>({});

  useEffect(() => {
    if (!node.current || map.current) return;
    const instance = createOpsMap(node.current);
    map.current = instance;
    return () => { instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    for (const [vehicleId, telemetry] of Object.entries(vehicles)) {
      const marker = markers.current[vehicleId] ?? new Marker({ color: "#d9dde1" }).setLngLat([telemetry.longitude, telemetry.latitude]).addTo(instance);
      marker.setLngLat([telemetry.longitude, telemetry.latitude]).setPopup(new Popup().setText(callsigns[vehicleId] ?? vehicleId));
      makeMarkerInteractive(marker, `${callsigns[vehicleId] ?? vehicleId} live position`, () => onSelect(vehicleId));
      updateMarkerHeading(marker, telemetry.headingDeg);
      markers.current[vehicleId] = marker;
    }
    for (const [vehicleId, marker] of Object.entries(markers.current)) {
      if (!vehicles[vehicleId]) { marker.remove(); delete markers.current[vehicleId]; }
      else setMarkerSelected(marker, !selectedVehicleId || selectedVehicleId === vehicleId);
    }
  }, [vehicles, selectedVehicleId, onSelect, callsigns]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const updateLines = () => {
      const trails: OpsLine[] = Object.entries(history).map(([id, samples]) => ({
        id,
        coordinates: samples.map((sample) => [sample.longitude, sample.latitude]),
      }));
      const routes: OpsLine[] = Object.entries(plannedRoutes).map(([id, coordinates]) => ({ id, coordinates }));
      updateLineGeoJson(instance, { sourceId: "sentinel-live-trails", lines: trails, paint: { "line-color": "#f1f2f3", "line-width": 2, "line-opacity": 0.86 } });
      updateLineGeoJson(instance, { sourceId: "sentinel-planned-routes", lines: routes, paint: { "line-color": "#aeb5bc", "line-width": 2, "line-opacity": 0.66 } });
    };
    return updateWhenStyleReady(instance, updateLines);
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
    latitude: asNumber(payload.latitude),
    longitude: asNumber(payload.longitude),
    altitudeM: asNumber(payload.altitude_m),
    headingDeg: asNumber(payload.heading_deg),
    groundSpeedMps: asNumber(payload.ground_speed_mps),
    batteryPercent: asNumber(payload.battery_percent),
    gpsQualityPercent: asNumber(payload.gps_quality_percent, 100),
    sensorStatus: asString(payload.sensor_status, "AVAILABLE"),
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

function OperationalDiagnostics({ metrics, metricsError, connection, duplicates, missing, outOfOrder }: { metrics: RunMetrics | null; metricsError: string | null; connection: string; duplicates: number; missing: number; outOfOrder: number }) {
  const integrityNominal = duplicates === 0 && missing === 0 && outOfOrder === 0;
  return (
    <section className="card diagnostics-card" aria-label="Operational diagnostics">
      <div className="diagnostics-header"><div><div className="eyebrow">Operational diagnostics</div><h2>Control-plane health</h2></div><span className={`diagnostics-badge ${metrics ? "ready" : "warning"}`}><span className="status-dot" />{metrics ? "Durable metrics" : "Awaiting persistence"}</span></div>
      <div className="diagnostic-grid">
        <div className="metric"><span>Delivered telemetry</span><strong>{metrics?.telemetry_messages_delivered.toLocaleString() ?? "—"}</strong></div>
        <div className="metric"><span>Telemetry rate</span><strong>{metrics ? `${metrics.telemetry_throughput_per_second.toFixed(1)} msg/s` : "—"}</strong></div>
        <div className="metric"><span>p95 delivery latency</span><strong>{metrics ? `${metrics.latency_p95_ms.toFixed(1)} ms` : "—"}</strong></div>
        <div className="metric"><span>Communications availability</span><strong>{metrics ? `${metrics.communications_availability_percent.toFixed(1)}%` : "—"}</strong></div>
      </div>
      <div className="integrity-strip" aria-label="Live stream integrity">
        <div className="integrity-strip-item" data-state={connection === "LIVE" ? "nominal" : "attention"}><span>WS</span><strong>{connection}</strong></div>
        <div className="integrity-strip-item" data-state={missing === 0 ? "nominal" : "attention"}><span>MISSING</span><strong>{missing}</strong></div>
        <div className="integrity-strip-item" data-state={duplicates === 0 ? "nominal" : "attention"}><span>DUP</span><strong>{duplicates}</strong></div>
        <div className="integrity-strip-item" data-state={outOfOrder === 0 ? "nominal" : "attention"}><span>OOO</span><strong>{outOfOrder}</strong></div>
        <div className="integrity-strip-summary" data-state={integrityNominal && connection === "LIVE" ? "nominal" : "attention"}>{integrityNominal ? "Sequence integrity nominal" : "Sequence anomalies detected"}</div>
      </div>
      {metricsError && <div className="notice">Durable metrics are temporarily unavailable; the live telemetry stream remains active.</div>}
    </section>
  );
}

function VehicleDetail({ selected }: { selected: VehicleTelemetry | undefined }) {
  return (
    <section className="inspector-section" aria-labelledby="vehicle-detail-heading">
      <div className="eyebrow">Selected vehicle</div>
      <h3 id="vehicle-detail-heading">Vehicle detail</h3>
      {selected ? (
        <div className="vehicle-summary">
          <div className="metric"><span>Mission state</span><strong>{selected.missionState}</strong></div>
          <div className="metric"><span>Communications</span><strong>{selected.communicationsState}</strong></div>
          <div className="metric"><span>Battery</span><strong>{selected.batteryPercent.toFixed(1)}%</strong></div>
          <div className="metric"><span>Altitude</span><strong>{selected.altitudeM.toFixed(1)} m</strong></div>
          <div className="metric"><span>Ground speed</span><strong>{selected.groundSpeedMps.toFixed(1)} m/s</strong></div>
          <div className="metric"><span>GPS quality</span><strong>{selected.gpsQualityPercent.toFixed(0)}%</strong></div>
          <div className="metric"><span>Telemetry sequence</span><strong>{selected.sequence}</strong></div>
        </div>
      ) : <div className="empty-state"><Radio size={17} aria-hidden="true" /><strong>Waiting for telemetry.</strong><p>Select a vehicle after the run starts to inspect its latest state.</p></div>}
    </section>
  );
}

function FailureInjectionPanel({ run, selected, failureType, failureDuration, failureVehicleId, busy, onVehicleChange, onTypeChange, onDurationChange, onInject }: { run: Run; selected: VehicleTelemetry | undefined; failureType: FailureType; failureDuration: number; failureVehicleId: string; busy: boolean; onVehicleChange: (value: string) => void; onTypeChange: (value: FailureType) => void; onDurationChange: (value: number) => void; onInject: () => void }) {
  return (
    <section className="failure-panel" aria-labelledby="failure-heading">
      <div><div className="eyebrow">Simulation control</div><h3 id="failure-heading">Inject a simulated fault</h3><p className="inspector-description">Adds an auditable impairment to the selected run vehicle. It never controls physical hardware.</p></div>
      <label className="field">Target vehicle<select value={failureVehicleId} onChange={(event) => onVehicleChange(event.target.value)} disabled={run.vehicles.length === 0}><option value="">{selected ? "Selected vehicle" : "Choose a vehicle"}</option>{run.vehicles.map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.callsign}</option>)}</select></label>
      <label className="field">Fault type<select value={failureType} onChange={(event) => onTypeChange(event.target.value as FailureType)}>{failureTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
      <label className="field">Duration (seconds)<input type="number" min={1} max={900} value={failureDuration} onChange={(event) => onDurationChange(Number(event.target.value))} /></label>
      <button className="button" type="button" disabled={busy || run.status !== "RUNNING" || (!failureVehicleId && !selected)} onClick={onInject}><TriangleAlert size={13} aria-hidden="true" /> Inject simulated fault</button>
    </section>
  );
}

function EventTimeline({ events, search, severity, warningsFirst, onSearch, onSeverity, onSort }: { events: LiveEvent[]; search: string; severity: "ALL" | LiveEvent["severity"]; warningsFirst: boolean; onSearch: (value: string) => void; onSeverity: (value: "ALL" | LiveEvent["severity"]) => void; onSort: () => void }) {
  return (
    <section className="inspector-section" aria-labelledby="event-timeline-heading">
      <div className="eyebrow">Event stream</div><h3 id="event-timeline-heading">Live event timeline</h3>
      <div className="event-toolbar">
        <label className="field"><span className="sr-only">Search events</span><span className="input-with-icon"><Search size={13} aria-hidden="true" /><input aria-label="Filter live events" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Type or vehicle" /></span></label>
        <label className="field">Severity<select aria-label="Event severity" value={severity} onChange={(event) => onSeverity(event.target.value as "ALL" | LiveEvent["severity"])}><option value="ALL">All severities</option><option value="CRITICAL">Critical</option><option value="WARNING">Warning</option><option value="INFO">Info</option></select></label>
        <div className="event-toolbar-actions"><span className="save-state">{events.length} visible event{events.length === 1 ? "" : "s"}</span><button className="button" type="button" onClick={onSort}>{warningsFirst ? "Warnings first" : "Newest first"}</button></div>
      </div>
      <div className="events">{events.length === 0 ? <div className="event-empty">No events match the current filters.</div> : events.slice(0, 40).map((event) => <div className={`event ${event.severity.toLowerCase()}`} key={event.eventId}><strong>{event.type}</strong><span>{event.vehicleId ?? "SYSTEM"} · {event.simTimeMs} ms · {event.severity}</span></div>)}</div>
    </section>
  );
}

function FaultTimeline({ events }: { events: LiveEvent[] }) {
  const faults = events
    .filter((event) => event.severity !== "INFO" || /failure|fault|blackout|packet|latency|gps|battery|sensor|service/i.test(event.type))
    .sort((left, right) => right.simTimeMs - left.simTimeMs)
    .slice(0, 6);
  return (
    <section className="inspector-section" aria-labelledby="fault-timeline-heading">
      <div className="eyebrow">Fault timeline</div>
      <h3 id="fault-timeline-heading">Recent impairments</h3>
      {faults.length === 0 ? (
        <div className="event-empty">No simulated faults or elevated-severity events observed.</div>
      ) : (
        <div className="fault-timeline">
          {faults.map((event) => (
            <div className="fault-timeline-event" key={event.eventId}>
              <span className="fault-timeline-time">{event.simTimeMs} ms</span>
              <strong>{event.type}</strong>
              <span>{event.vehicleId ?? "SYSTEM"} · {event.severity}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function LiveOperations({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [plannedRoutes, setPlannedRoutes] = useState<Record<string, [number, number][]>>({});
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [failureType, setFailureType] = useState<FailureType>("COMMUNICATIONS_BLACKOUT");
  const [failureDuration, setFailureDuration] = useState(10);
  const [failureVehicleId, setFailureVehicleId] = useState("");
  const [fleetSearch, setFleetSearch] = useState("");
  const [eventSeverityFilter, setEventSeverityFilter] = useState<"ALL" | LiveEvent["severity"]>("ALL");
  const [eventSearch, setEventSearch] = useState("");
  const [warningsFirst, setWarningsFirst] = useState(true);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const { vehicles, history, events, connection, selectedVehicleId, duplicates, missing, outOfOrder, setConnection, selectVehicle, ingestTelemetry, hydrateTelemetry, ingestEvent, reset } = useLiveTelemetry();
  const metricsLive = run?.status === "READY" || run?.status === "RUNNING" || run?.status === "PAUSED";

  useEffect(() => {
    reset();
    getRun(runId).then(async (loadedRun) => {
      setRun(loadedRun);
      setFailureVehicleId(loadedRun.vehicles[0]?.id ?? "");
      try {
        const loadedMission = await getMission(loadedRun.mission_id);
        setMission(loadedMission);
        const runVehicleByDefinition = new Map(loadedRun.vehicles.map((vehicle) => [vehicle.vehicle_definition_id, vehicle.id]));
        const missionVehicleToRunVehicle = new Map(loadedMission.vehicles.map((vehicle) => [vehicle.id, runVehicleByDefinition.get(vehicle.vehicle_definition_id)]));
        const routes: Record<string, [number, number][]> = {};
        for (const waypoint of loadedMission.waypoints) {
          const runVehicleId = waypoint.vehicle_id ? missionVehicleToRunVehicle.get(waypoint.vehicle_id) : undefined;
          if (!runVehicleId) continue;
          (routes[runVehicleId] ??= []).push([waypoint.longitude, waypoint.latitude]);
        }
        setPlannedRoutes(routes);
      } catch {
        setError("Mission definition unavailable; live telemetry remains available.");
      }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load run"));
    return reset;
  }, [runId, reset]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const value = await getMetrics(runId);
        if (active) { setMetrics(value); setMetricsError(null); }
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
    if (!metricsLive) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshRun = async () => {
      try {
        const latestRun = await getRun(runId);
        if (active) setRun(latestRun);
      } catch (reason: unknown) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to refresh run status");
      } finally {
        if (active) timer = setTimeout(refreshRun, 2_000);
      }
    };
    timer = setTimeout(refreshRun, 2_000);
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [runId, metricsLive]);

  useEffect(() => {
    const wsBase = process.env.NEXT_PUBLIC_WS_BASE_URL ?? "ws://localhost:8000";
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    let attempts = 0;
    const clearTimers = () => { if (retry) clearTimeout(retry); if (heartbeat) clearInterval(heartbeat); retry = undefined; heartbeat = undefined; };
    const connect = async () => {
      if (disposed) return;
      setConnection(attempts > 0 ? "RECONNECTING" : "DISCONNECTED");
      try {
        const token = await ensureAuthSession("operator");
        socket = new WebSocket(`${wsBase}/ws/runs/${runId}?token=${encodeURIComponent(token)}`);
      } catch {
        setConnection("RECONNECTING");
        retry = setTimeout(connect, Math.min(10_000, 500 * 2 ** Math.min(attempts++, 5)));
        return;
      }
      socket.onopen = () => {
        attempts = 0;
        setConnection("LIVE");
        getRunSnapshot(runId).then((snapshot) => { for (const item of snapshot.vehicles) if (item.telemetry) hydrateTelemetry(telemetryFromSnapshot(item.telemetry)); }).catch(() => undefined);
        socket?.send(JSON.stringify({ type: "subscribe", topics: ["telemetry", "events", "metrics"] }));
        heartbeat = setInterval(() => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" })); }, 15_000);
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
            if (["mission.started", "mission.paused", "mission.resumed", "mission.completed", "mission.aborted"].includes(envelope.data.type)) getRun(runId).then(setRun).catch(() => undefined);
          }
        } catch { setError("Received an invalid realtime message"); }
      };
      socket.onclose = () => { clearTimers(); if (disposed) { setConnection("DISCONNECTED"); return; } setConnection("RECONNECTING"); retry = setTimeout(connect, Math.min(10_000, 500 * 2 ** Math.min(attempts++, 5))); };
      socket.onerror = () => setConnection("RECONNECTING");
    };
    connect();
    return () => { disposed = true; clearTimers(); socket?.close(); setConnection("DISCONNECTED"); };
  }, [runId, hydrateTelemetry, ingestEvent, ingestTelemetry, setConnection]);

  const command = async (action: "start" | "pause" | "resume" | "stop") => {
    setStarting(true); setError(null);
    try {
      const commandResult = action === "start" ? startRun(runId) : action === "pause" ? pauseRun(runId) : action === "resume" ? resumeRun(runId) : stopRun(runId);
      setRun(await commandResult);
      setAuditRefreshKey((value) => value + 1);
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
  const callsigns = Object.fromEntries(run?.vehicles.map((vehicle) => [vehicle.id, vehicle.callsign]) ?? []);
  const targetVehicleId = failureVehicleId || selected?.vehicleId || run?.vehicles[0]?.id || "";

  const inject = async () => {
    if (!targetVehicleId) return;
    setError(null);
    try {
      await createFailure(runId, { vehicle_id: targetVehicleId, failure_type: failureType, duration_ms: failureDuration * 1000 });
      setAuditRefreshKey((value) => value + 1);
    }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Unable to inject simulated fault"); }
  };

  if (!run) return <main className="main"><div className="surface loading-state" role="status">{error ?? "Loading run…"}</div></main>;

  return (
    <main className="main">
      <PageHeader
        breadcrumbs={[{ label: "Missions", href: "/missions" }, { label: mission?.name ?? "Mission run" }, { label: "Live operations" }]}
        eyebrow={`Run ${run.id.slice(0, 8)} / live operations`}
        title={mission?.name ?? "Mission run"}
        description="Observe the active simulation. WebSocket telemetry is transient; durable metrics and replay are loaded from the system of record."
        status={<div className="run-status-line"><StatusBadge label={run.status} tone={statusTone(run.status)} /><span className="elapsed">{elapsedMs} ms simulation time</span></div>}
        actions={<div className="actions compact">{run.status === "READY" && <button className="button primary" type="button" disabled={starting} onClick={() => command("start")}><Play size={14} fill="currentColor" aria-hidden="true" /> {starting ? "Starting…" : "Start run"}</button>}{run.status === "RUNNING" && <><button className="button" type="button" disabled={starting} onClick={() => command("pause")}><Pause size={14} aria-hidden="true" /> Pause run</button><button className="button danger" type="button" disabled={starting} onClick={() => command("stop")}><Square size={13} aria-hidden="true" /> Stop run</button></>}{run.status === "PAUSED" && <><button className="button primary" type="button" disabled={starting} onClick={() => command("resume")}><Play size={14} fill="currentColor" aria-hidden="true" /> Resume run</button><button className="button danger" type="button" disabled={starting} onClick={() => command("stop")}><Square size={13} aria-hidden="true" /> Stop run</button></>}</div>}
      />
      {error && <div className="notice error" role="alert"><strong>Live operations notice.</strong> {error}</div>}
      <RunNavigation runId={runId} active="live" />
      <OperationalDiagnostics metrics={metrics} metricsError={metricsError} connection={connection} duplicates={duplicates} missing={missing} outOfOrder={outOfOrder} />

      <div className="workspace">
        <aside className="rail" aria-label="Fleet telemetry">
          <header className="rail-header"><div><div className="eyebrow">Fleet telemetry</div><h2>Vehicles</h2><p className="rail-description">Select a vehicle to focus the map and detail panel.</p></div><span className="rail-count">{run.vehicles.length}</span></header>
          <label className="field"><span>Search callsigns</span><span className="input-with-icon"><Search size={13} aria-hidden="true" /><input aria-label="Search fleet" value={fleetSearch} onChange={(event) => setFleetSearch(event.target.value)} placeholder="UAV-007" /></span></label>
          {visibleVehicles.length === 0 ? <div className="list-empty">No vehicles match this search.</div> : <div className="list">{visibleVehicles.map((vehicle) => { const telemetry = vehicles[vehicle.id]; return <button className={`list-item selectable ${selectedVehicleId === vehicle.id ? "selected" : ""}`} type="button" key={vehicle.id} onClick={() => selectVehicle(vehicle.id)} aria-pressed={selectedVehicleId === vehicle.id}><strong>{vehicle.callsign}</strong><span>{telemetry?.missionState ?? run.status} · {telemetry?.communicationsState ?? "Awaiting telemetry"}</span></button>; })}</div>}
          <div className="fleet-integrity"><div className="eyebrow">Browser integrity counters</div><div className="metric"><span>Missing sequences</span><strong>{missing}</strong></div><div className="metric"><span>Duplicates</span><strong>{duplicates}</strong></div><div className="metric"><span>Out of order</span><strong>{outOfOrder}</strong></div></div>
        </aside>

        <section className="map-stage" aria-label="Live mission map">
          <LiveMap vehicles={vehicles} history={history} plannedRoutes={plannedRoutes} callsigns={callsigns} selectedVehicleId={selectedVehicleId} onSelect={selectVehicle} />
          <div className="map-legend" aria-label="Map legend"><span className="legend-item"><span className="legend-mark point" /> Live vehicle</span><span className="legend-item"><span className="legend-mark" /> Telemetry trail</span><span className="legend-item"><span className="legend-mark trail" /> Planned route</span></div>
          <div className="map-hint"><strong>Live mission map</strong><span><Radio size={12} aria-hidden="true" /> WebSocket {connection} · select a marker for detail</span></div>
        </section>

        <aside className="inspector" aria-label="Live run inspector">
          <header className="inspector-header"><div><div className="eyebrow">Run inspector</div><h2>{selected ? callsigns[selected.vehicleId] ?? "Vehicle detail" : "Vehicle detail"}</h2><p className="inspector-description">Latest decoded telemetry for the focused vehicle.</p></div></header>
          {selected && <VehicleInspectField headingDeg={selected.headingDeg} batteryPercent={selected.batteryPercent} communicationsState={selected.communicationsState} callsign={callsigns[selected.vehicleId] ?? selected.vehicleId} />}
          <VehicleDetail selected={selected} />
          <FailureInjectionPanel run={run} selected={selected} failureType={failureType} failureDuration={failureDuration} failureVehicleId={failureVehicleId} busy={starting} onVehicleChange={setFailureVehicleId} onTypeChange={setFailureType} onDurationChange={setFailureDuration} onInject={inject} />
          <FaultTimeline events={events} />
          <EventTimeline events={visibleEvents} search={eventSearch} severity={eventSeverityFilter} warningsFirst={warningsFirst} onSearch={setEventSearch} onSeverity={setEventSeverityFilter} onSort={() => setWarningsFirst((value) => !value)} />
        </aside>
      </div>
      <AuditPanel runId={runId} refreshKey={auditRefreshKey} />
    </main>
  );
}
