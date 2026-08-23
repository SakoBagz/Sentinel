"use client";

import Link from "next/link";
import { ArrowUpRight, FileText, MessageSquare, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { AuditPanel } from "@/components/audit-panel";
import { PageHeader } from "@/components/page-header";
import { RunNavigation } from "@/components/run-navigation";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { askAnalyst, getDebrief, getMetrics, getMission, getRun, AnalystResponse, RunMetrics } from "@/lib/api";

function seconds(milliseconds: number): string { return `${Math.round(milliseconds / 1000)}s`; }

export function DebriefDashboard({ runId }: { runId: string }) {
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);
  const [missionName, setMissionName] = useState("Mission run");
  const [error, setError] = useState<string | null>(null);
  const [analyst, setAnalyst] = useState<AnalystResponse | null>(null);
  const [question, setQuestion] = useState("What were the most important operational incidents?");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getMetrics(runId), getRun(runId)])
      .then(([loadedMetrics, run]) => {
        if (!active) return;
        setMetrics(loadedMetrics);
        return getMission(run.mission_id).then((mission) => { if (active) setMissionName(mission.name); }).catch(() => undefined);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load debrief metrics"); });
    return () => { active = false; };
  }, [runId]);

  const runAnalyst = async (action: () => Promise<AnalystResponse>) => {
    setAsking(true); setError(null);
    try { setAnalyst(await action()); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Operational analysis unavailable"); }
    finally { setAsking(false); }
  };

  if (error && !metrics) return <main className="main"><div className="notice error" role="alert"><strong>Debrief unavailable.</strong> {error}</div></main>;
  if (!metrics) return <main className="main"><div className="surface loading-state" role="status">Loading run metrics…</div></main>;

  return (
    <main className="main">
      <PageHeader breadcrumbs={[{ label: "Missions", href: "/missions" }, { label: missionName }, { label: "Debrief" }]} eyebrow={`Run ${runId.slice(0, 8)} / debrief`} title="Operational debrief" description="Summarize the completed run using persisted measurements, integrity counters, and read-only evidence links." status={<StatusBadge label="EVIDENCE VIEW" tone="neutral" />} />
      {error && <div className="notice error" role="alert"><strong>Operational analysis notice.</strong> {error}</div>}
      <RunNavigation runId={runId} active="debrief" />

      <section aria-labelledby="summary-heading">
        <div className="section-heading"><div><div className="eyebrow">Persisted measurements</div><h2 id="summary-heading">Run summary</h2></div><span className="section-aside">Source: PostgreSQL metrics endpoint</span></div>
        <div className="summary-grid">
          <article className="card summary-card"><div className="eyebrow">Mission outcome</div><h2>{seconds(metrics.mission_duration_ms)}</h2><div className="metric"><span>Vehicles completed</span><strong>{metrics.completed_vehicle_count} / {metrics.vehicle_count}</strong></div><div className="metric"><span>Comms availability</span><strong>{metrics.communications_availability_percent.toFixed(1)}%</strong></div></article>
          <article className="card summary-card"><div className="eyebrow">Event severity</div><h2>{metrics.event_count} events</h2><div className="metric"><span>Warnings</span><strong>{metrics.warning_count}</strong></div><div className="metric"><span>Critical</span><strong>{metrics.critical_count}</strong></div></article>
          <article className="card summary-card"><div className="eyebrow">Delivery performance</div><h2>{metrics.telemetry_throughput_per_second.toFixed(1)} msg/s</h2><div className="metric"><span>p50 latency</span><strong>{metrics.latency_p50_ms.toFixed(1)} ms</strong></div><div className="metric"><span>p95 / p99 latency</span><strong>{metrics.latency_p95_ms.toFixed(1)} / {metrics.latency_p99_ms.toFixed(1)} ms</strong></div></article>
        </div>
      </section>

      <section className="card integrity-card" aria-labelledby="integrity-heading"><div className="section-heading"><div><div className="eyebrow">Data integrity</div><h2 id="integrity-heading">Telemetry accounting</h2><p>Integrity counters come from the completed run summary, not database sampling gaps.</p></div><ShieldCheck size={18} aria-hidden="true" /></div><div className="diagnostic-grid"><div className="metric"><span>Generated messages</span><strong>{metrics.telemetry_messages_generated.toLocaleString()}</strong></div><div className="metric"><span>Delivered messages</span><strong>{metrics.telemetry_messages_delivered.toLocaleString()}</strong></div><div className="metric"><span>Persisted samples</span><strong>{metrics.telemetry_messages_persisted.toLocaleString()}</strong></div><div className="metric"><span>Missing originals</span><strong>{metrics.telemetry_sequences_missing}</strong></div><div className="metric"><span>Duplicates</span><strong>{metrics.telemetry_sequences_duplicate}</strong></div><div className="metric"><span>Out of order</span><strong>{metrics.telemetry_sequences_out_of_order}</strong></div></div></section>

      <AuditPanel runId={runId} />

      <section className="card analyst-panel" aria-labelledby="analyst-heading">
        <div className="section-heading"><div><div className="eyebrow">Operational analysis / read-only</div><h2 id="analyst-heading">Ask an evidence-backed question</h2><p>The analysis service can summarize this run and link claims to persisted event IDs. It cannot modify mission state or control vehicles.</p></div><MessageSquare size={18} aria-hidden="true" /></div>
        <div className="analyst-actions">
          <button className="button" type="button" disabled={asking} onClick={() => runAnalyst(() => getDebrief(runId))}><FileText size={14} aria-hidden="true" />{asking ? "Generating…" : "Generate analysis"}</button>
          <div className="analyst-question"><label htmlFor="analyst-question">Question for operational analysis</label><input id="analyst-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} placeholder="Ask about incidents, reliability, or completion" /><button className="button primary" type="button" disabled={asking || !question.trim()} onClick={() => runAnalyst(() => askAnalyst(runId, question))}>Ask analysis</button></div>
        </div>
        {analyst && <div className="analyst-result"><div className="analyst-result-header"><div><div className="eyebrow">Analysis response</div><strong>Operational analysis</strong></div><StatusBadge label={`${analyst.confidence} confidence`} tone={statusTone(analyst.confidence === "high" ? "HEALTHY" : analyst.confidence === "medium" ? "STALE" : "CRITICAL")} /></div><p className="analyst-answer">{analyst.answer}</p>{Object.entries(analyst.sections).map(([title, content]) => <div className="analyst-section" key={title}><strong>{title}</strong><p className="card-copy">{content}</p></div>)}{analyst.evidence.length > 0 && <div className="evidence-list"><div className="eyebrow">Supporting events</div>{analyst.evidence.map((evidence) => <Link className="event" key={evidence.event_id} href={`/runs/${runId}/replay?time=${evidence.sim_time_ms}&event_id=${evidence.event_id}${evidence.vehicle_id ? `&vehicle_id=${evidence.vehicle_id}` : ""}`}><strong>{evidence.event_id.slice(0, 8)} <ArrowUpRight size={12} aria-hidden="true" /></strong><span>{evidence.sim_time_ms} ms · {evidence.vehicle_id?.slice(0, 8) ?? "SYSTEM"}</span></Link>)}</div>}{analyst.limitations.length > 0 && <div className="limitations">{analyst.limitations.map((limitation) => <div className="notice" key={limitation}>{limitation}</div>)}</div>}</div>}
      </section>
    </main>
  );
}
