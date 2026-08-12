"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getEvents, getReplay, MissionEvent, TelemetrySample } from "@/lib/api";

export function ReplayViewer({ runId }: { runId: string }) {
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedEvent, setHighlightedEvent] = useState<string | null>(null);
  useEffect(() => { const params = new URLSearchParams(window.location.search); const requestedTime = params.get("time"); const eventId = params.get("event_id"); if (requestedTime) setTime(Number(requestedTime)); if (eventId) setHighlightedEvent(eventId); Promise.all([getReplay(runId), getEvents(runId)]).then(([telemetry, history]) => { setSamples(telemetry); setEvents(history); if (requestedTime) setTime(Number(requestedTime)); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load replay")); }, [runId]);
  const end = samples.at(-1)?.sim_time_ms ?? 0;
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => setTime((value) => { if (value >= end) { setPlaying(false); return end; } return Math.min(end, value + 100); }), 100);
    return () => clearInterval(interval);
  }, [playing, end]);
  const current = useMemo(() => {
    const latest = new Map<string, TelemetrySample>();
    for (const sample of samples) { if (sample.sim_time_ms <= time) latest.set(sample.vehicle_id, sample); }
    return [...latest.values()];
  }, [samples, time]);
  if (error) return <main className="main"><div className="notice error">{error}</div></main>;
  return <main className="main"><div className="eyebrow">Replay / {runId}</div><h1>Historical mission</h1><div className="card"><div className="replay-toolbar"><button className="button primary" onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button><label className="speed">Time <input type="range" min={0} max={Math.max(1, end)} value={Math.min(time, end)} onChange={(event) => { setPlaying(false); setTime(Number(event.target.value)); }} /></label><span>{time} ms / {end} ms</span></div><div className="replay-map"><div className="eyebrow">Persisted vehicle state · {current.length} vehicles</div><div className="replay-vehicles">{current.map((sample) => <div className="replay-vehicle" key={sample.vehicle_id}><strong>{sample.vehicle_id.slice(0, 8)}</strong><span>{sample.latitude?.toFixed(4)}, {sample.longitude?.toFixed(4)} · {sample.mission_state}</span></div>)}</div></div></div><div className="grid replay-lower"><div className="card"><div className="eyebrow">Event timeline</div><div className="events">{events.map((event) => <Link href={`/runs/${runId}/replay?time=${event.sim_time_ms}&event_id=${event.id}`} className={`event ${event.severity.toLowerCase()} ${highlightedEvent === event.id ? "highlighted" : ""}`} key={event.id}><strong>{event.event_type}</strong><span>{event.sim_time_ms} ms · {event.vehicle_id?.slice(0, 8) ?? "SYSTEM"}</span></Link>)}</div></div><div className="card"><div className="eyebrow">Replay contract</div><p className="card-copy">This view reads durable telemetry and events. It never reruns the simulator.</p><div className="metric"><span>Samples loaded</span><strong>{samples.length}</strong></div><div className="metric"><span>Events loaded</span><strong>{events.length}</strong></div></div></div></main>;
}
