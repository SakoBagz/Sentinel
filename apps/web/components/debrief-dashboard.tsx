"use client";

import { useEffect, useState } from "react";

import { getMetrics, RunMetrics } from "@/lib/api";

function seconds(milliseconds: number): string { return `${Math.round(milliseconds / 1000)}s`; }

export function DebriefDashboard({ runId }: { runId: string }) {
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getMetrics(runId).then(setMetrics).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load metrics")); }, [runId]);
  if (error) return <main className="main"><div className="notice error">{error}</div></main>;
  if (!metrics) return <main className="main"><div className="card">Loading debrief…</div></main>;
  return <main className="main"><div className="eyebrow">Mission debrief / {runId}</div><h1>Operational summary</h1><div className="grid"><div className="card"><div className="eyebrow">Mission</div><div className="metric"><span>Duration</span><strong>{seconds(metrics.mission_duration_ms)}</strong></div><div className="metric"><span>Vehicles</span><strong>{metrics.vehicle_count}</strong></div><div className="metric"><span>Completed vehicles</span><strong>{metrics.completed_vehicle_count}</strong></div><div className="metric"><span>Communications availability</span><strong>{metrics.communications_availability_percent.toFixed(1)}%</strong></div></div><div className="card"><div className="eyebrow">Events</div><div className="metric"><span>Total</span><strong>{metrics.event_count}</strong></div><div className="metric"><span>Warnings</span><strong>{metrics.warning_count}</strong></div><div className="metric"><span>Critical</span><strong>{metrics.critical_count}</strong></div></div><div className="card"><div className="eyebrow">System performance</div><div className="metric"><span>Throughput</span><strong>{metrics.telemetry_throughput_per_second.toFixed(1)} msg/s</strong></div><div className="metric"><span>p50 latency</span><strong>{metrics.latency_p50_ms.toFixed(1)} ms</strong></div><div className="metric"><span>p95 latency</span><strong>{metrics.latency_p95_ms.toFixed(1)} ms</strong></div><div className="metric"><span>p99 latency</span><strong>{metrics.latency_p99_ms.toFixed(1)} ms</strong></div></div></div><div className="card debrief-sequence"><div className="eyebrow">Messaging integrity</div><div className="metric"><span>Received</span><strong>{metrics.telemetry_messages_received}</strong></div><div className="metric"><span>Missing sequences</span><strong>{metrics.telemetry_sequences_missing}</strong></div><div className="metric"><span>Duplicates</span><strong>{metrics.telemetry_sequences_duplicate}</strong></div><div className="metric"><span>Out of order</span><strong>{metrics.telemetry_sequences_out_of_order}</strong></div></div></main>;
}
