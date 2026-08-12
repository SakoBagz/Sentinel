"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getEvents, getReplay, MissionEvent, TelemetrySample } from "@/lib/api";
import { replayStateAt } from "@/lib/replay";

export function ReplayViewer({ runId }: { runId: string }) {
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [highlightedEvent, setHighlightedEvent] = useState<string | null>(null);
  useEffect(() => { const params = new URLSearchParams(window.location.search); const requestedTime = params.get("time"); const eventId = params.get("event_id"); const vehicleId = params.get("vehicle_id"); if (requestedTime) setTime(Number(requestedTime)); if (eventId) setHighlightedEvent(eventId); if (vehicleId) setSelectedVehicleId(vehicleId); Promise.all([getReplay(runId), getEvents(runId)]).then(([telemetry, history]) => { setSamples(telemetry); setEvents(history); if (requestedTime) setTime(Number(requestedTime)); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load replay")); }, [runId]);
  const end = samples.at(-1)?.sim_time_ms ?? 0;
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => setTime((value) => { if (value >= end) { setPlaying(false); return end; } return Math.min(end, value + 100 * speed); }), 100);
    return () => clearInterval(interval);
  }, [playing, end, speed]);
  const current = useMemo(() => replayStateAt(samples, time), [samples, time]);
  const vehicleIds = useMemo(() => [...new Set(samples.map((sample) => sample.vehicle_id))].sort(), [samples]);
  const visible = selectedVehicleId ? current.filter((sample) => sample.vehicle_id === selectedVehicleId) : current;
  if (error) return <main className="main"><div className="notice error">{error}</div></main>;
  return <main className="main"><div className="eyebrow">Replay / {runId}</div><h1>Historical mission</h1><div className="card"><div className="replay-toolbar"><button className="button primary" onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button><label className="speed">Time <input aria-label="Replay time" type="range" min={0} max={Math.max(1, end)} value={Math.min(time, end)} onChange={(event) => { setPlaying(false); setTime(Number(event.target.value)); }} /></label><label className="speed">Speed <select aria-label="Replay speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{[0.5, 1, 2, 5, 10].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label><label className="speed">Vehicle <select aria-label="Replay vehicle" value={selectedVehicleId} onChange={(event) => setSelectedVehicleId(event.target.value)}><option value="">All</option>{vehicleIds.map((vehicleId) => <option key={vehicleId} value={vehicleId}>{vehicleId.slice(0, 8)}</option>)}</select></label><span>{time} ms / {end} ms</span></div><div className="replay-map"><div className="eyebrow">Persisted vehicle state · {visible.length} vehicles</div><div className="replay-vehicles">{visible.map((sample) => <div className="replay-vehicle" key={sample.vehicle_id}><strong>{sample.vehicle_id.slice(0, 8)}</strong><span>{sample.latitude?.toFixed(4)}, {sample.longitude?.toFixed(4)} · {sample.mission_state}{sample.interpolated ? " · interpolated visual state" : ""}</span></div>)}</div></div></div><div className="grid replay-lower"><div className="card"><div className="eyebrow">Event timeline</div><div className="events">{events.map((event) => <Link href={`/runs/${runId}/replay?time=${event.sim_time_ms}&event_id=${event.id}${event.vehicle_id ? `&vehicle_id=${event.vehicle_id}` : ""}`} className={`event ${event.severity.toLowerCase()} ${highlightedEvent === event.id ? "highlighted" : ""}`} key={event.id}><strong>{event.event_type}</strong><span>{event.sim_time_ms} ms · {event.vehicle_id?.slice(0, 8) ?? "SYSTEM"}</span></Link>)}</div></div><div className="card"><div className="eyebrow">Replay contract</div><p className="card-copy">This view reads durable telemetry and events. It never reruns the simulator. Values marked interpolated are presentation-only.</p><div className="metric"><span>Samples loaded</span><strong>{samples.length}</strong></div><div className="metric"><span>Events loaded</span><strong>{events.length}</strong></div></div></div></main>;
}
