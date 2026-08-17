"use client";

import Link from "next/link";
import { Pause, Play, SkipForward } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { ReplayMap } from "@/components/replay-map";
import { RunNavigation } from "@/components/run-navigation";
import { StatusBadge } from "@/components/status-badge";
import { getEvents, getMission, getReplay, getRun, MissionEvent, TelemetrySample } from "@/lib/api";
import { replayStateAt } from "@/lib/replay";

export function ReplayViewer({ runId }: { runId: string }) {
  const searchKey = useSearchParams().toString();
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [callsigns, setCallsigns] = useState<Record<string, string>>({});
  const [missionName, setMissionName] = useState("Mission run");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightedEvent, setHighlightedEvent] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getReplay(runId), getEvents(runId), getRun(runId)])
      .then(([telemetry, history, run]) => {
        if (!active) return;
        setSamples(telemetry);
        setEvents(history);
        setCallsigns(Object.fromEntries(run.vehicles.map((vehicle) => [vehicle.id, vehicle.callsign])));
        return getMission(run.mission_id).then((mission) => { if (active) setMissionName(mission.name); }).catch(() => undefined);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load replay"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [runId]);

  useEffect(() => {
    const params = new URLSearchParams(searchKey);
    const requestedTime = Number(params.get("time") ?? 0);
    setTime(Number.isFinite(requestedTime) ? requestedTime : 0);
    setHighlightedEvent(params.get("event_id"));
    setSelectedVehicleId(params.get("vehicle_id") ?? "");
  }, [searchKey]);

  const end = samples.at(-1)?.sim_time_ms ?? 0;
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => setTime((value) => {
      if (value >= end) { setPlaying(false); return end; }
      return Math.min(end, value + 100 * speed);
    }), 100);
    return () => clearInterval(interval);
  }, [playing, end, speed]);

  const current = useMemo(() => replayStateAt(samples, Math.min(time, end)), [samples, time, end]);
  const vehicleIds = useMemo(() => [...new Set(samples.map((sample) => sample.vehicle_id))].sort(), [samples]);
  const visible = selectedVehicleId ? current.filter((sample) => sample.vehicle_id === selectedVehicleId) : current;
  const vehicleLabel = (vehicleId: string) => callsigns[vehicleId] ?? vehicleId.slice(0, 8);

  if (loading) return <main className="main"><div className="surface loading-state" role="status">Loading persisted telemetry and events…</div></main>;
  if (error) return <main className="main"><div className="notice error" role="alert"><strong>Replay unavailable.</strong> {error}</div></main>;

  return (
    <main className="main">
      <PageHeader breadcrumbs={[{ label: "Missions", href: "/missions" }, { label: missionName }, { label: "Replay" }]} eyebrow={`Run ${runId.slice(0, 8)} / historical replay`} title="Historical mission" description="Inspect persisted telemetry and events at a chosen simulation time. Replay never reruns the simulator." status={<StatusBadge label="READ-ONLY" tone="neutral" />} />
      <RunNavigation runId={runId} active="replay" />

      <section className="surface" aria-labelledby="replay-controls-heading">
        <div className="surface-header"><div><div className="eyebrow">Playback controls</div><h2 id="replay-controls-heading">Review the recorded run</h2><p>Playback changes the visual time cursor only; persisted samples remain factual.</p></div><span className="section-aside">{current.length} vehicle{current.length === 1 ? "" : "s"} at cursor</span></div>
        <div className="surface-body">
          <div className="replay-toolbar">
            <button className="button primary" type="button" onClick={() => setPlaying((value) => !value)} disabled={end === 0}>{playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} fill="currentColor" aria-hidden="true" />}{playing ? "Pause" : "Play"}</button>
            <label className="replay-control"><span>Simulation time</span><input aria-label="Replay time" type="range" min={0} max={Math.max(1, end)} value={Math.min(time, end)} onChange={(event) => { setPlaying(false); setTime(Number(event.target.value)); }} /></label>
            <label className="replay-control"><span>Speed</span><select aria-label="Replay speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{[0.5, 1, 2, 5, 10].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label>
            <label className="replay-control"><span>Focus</span><select aria-label="Replay vehicle" value={selectedVehicleId} onChange={(event) => setSelectedVehicleId(event.target.value)}><option value="">All vehicles</option>{vehicleIds.map((vehicleId) => <option key={vehicleId} value={vehicleId}>{vehicleLabel(vehicleId)}</option>)}</select></label>
            <span className="replay-time">{time} / {end} ms</span>
          </div>
          <div className="replay-map" aria-label="Historical vehicle map">
            <ReplayMap samples={samples} current={current} callsigns={callsigns} selectedVehicleId={selectedVehicleId} onSelect={setSelectedVehicleId} />
            <div className="map-legend" aria-label="Replay map legend"><span className="legend-item"><span className="legend-mark point" /> Current state</span><span className="legend-item"><span className="legend-mark trail" /> Persisted trail</span></div>
            <div className="replay-readout"><strong>{selectedVehicleId ? vehicleLabel(selectedVehicleId) : "All vehicles"}</strong><span>{visible.length === 0 ? "No state at this timestamp" : `${visible.length} vehicle state${visible.length === 1 ? "" : "s"} · ${current.some((sample) => sample.interpolated) ? "visual interpolation active" : "persisted sample"}`}</span></div>
          </div>
        </div>
      </section>

      <div className="grid replay-lower">
        <section className="card replay-event-card" aria-labelledby="replay-events-heading"><div className="section-heading"><div><div className="eyebrow">Event navigation</div><h2 id="replay-events-heading">Recorded event timeline</h2><p>Select an event to move the cursor and focus its vehicle.</p></div><SkipForward size={16} aria-hidden="true" /></div><div className="events">{events.length === 0 ? <div className="event-empty">No persisted events in this run.</div> : events.map((event) => <Link href={`/runs/${runId}/replay?time=${event.sim_time_ms}&event_id=${event.id}${event.vehicle_id ? `&vehicle_id=${event.vehicle_id}` : ""}`} onClick={() => { setPlaying(false); setTime(event.sim_time_ms); setHighlightedEvent(event.id); setSelectedVehicleId(event.vehicle_id ?? ""); }} className={`event ${event.severity.toLowerCase()} ${highlightedEvent === event.id ? "highlighted" : ""}`} key={event.id}><strong>{event.event_type}</strong><span>{event.sim_time_ms} ms · {event.vehicle_id ? vehicleLabel(event.vehicle_id) : "SYSTEM"} · {event.severity}</span></Link>)}</div></section>
        <section className="card replay-contract" aria-labelledby="replay-contract-heading"><div><div className="eyebrow">Replay contract</div><h2 id="replay-contract-heading">What this screen guarantees</h2><p>This view reads durable telemetry and events. It never reruns simulation logic. Values marked as interpolated are presentation-only positions between persisted samples.</p></div><div className="metric"><span>Samples loaded</span><strong>{samples.length.toLocaleString()}</strong></div><div className="metric"><span>Events loaded</span><strong>{events.length.toLocaleString()}</strong></div><div className="metric"><span>Recorded duration</span><strong>{end} ms</strong></div></section>
      </div>
    </main>
  );
}
