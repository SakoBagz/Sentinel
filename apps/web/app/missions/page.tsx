"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { createMission, listMissions, Mission } from "@/lib/api";

export default function MissionsPage() {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listMissions()
      .then((value) => { if (active) setMissions(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load missions"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const mission = await createMission({ name: "New survey mission", scenario_type: "environmental_survey" });
      router.push(`/missions/${mission.id}/plan`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to create mission");
      setBusy(false);
    }
  };

  return (
    <main className="main">
      <PageHeader
        eyebrow="Mission catalog / definitions"
        title="Mission definitions"
        description="A mission is a reusable configuration. Define the fleet and route here; each execution becomes a separate, replayable run."
        actions={<button className="button primary" type="button" onClick={create} disabled={busy} aria-busy={busy}><Plus size={14} aria-hidden="true" />{busy ? "Creating draft…" : "New mission"}</button>}
      />

      {error && <div className="notice error" role="alert"><strong>Mission catalog unavailable.</strong> {error}</div>}

      <section aria-labelledby="mission-list-heading">
        <div className="catalog-toolbar">
          <div><div className="eyebrow">Reusable configurations</div><p id="mission-list-heading">{loading ? "Loading mission definitions…" : `${missions.length} mission${missions.length === 1 ? "" : "s"} available`}</p></div>
          <span className="section-aside">Select a mission to plan or review</span>
        </div>
        {loading ? (
          <div className="surface loading-state" role="status">Loading mission definitions…</div>
        ) : missions.length === 0 ? (
          <div className="surface empty-state">
            <strong>No mission definitions yet.</strong>
            <p>Create a draft to define a fleet, add route points, and produce the first deterministic run.</p>
            <button className="button" type="button" onClick={create} disabled={busy}><Plus size={14} aria-hidden="true" /> Create the first mission</button>
          </div>
        ) : (
          <div className="mission-list">
            <div className="mission-row mission-table-header" aria-hidden="true">
              <span className="table-label">Definition</span><span className="table-label">Fleet</span><span className="table-label">Lifecycle</span><span />
            </div>
            {missions.map((mission) => (
              <article className="mission-row" key={mission.id}>
                <div className="mission-name">
                  <strong>{mission.name}</strong>
                  <span>{mission.scenario_type?.replaceAll("_", " ") ?? "General operation"}</span>
                </div>
                <div className="mission-meta"><strong>{mission.vehicles.length} UAV{mission.vehicles.length === 1 ? "" : "s"}</strong><span>{mission.waypoints.length} route point{mission.waypoints.length === 1 ? "" : "s"}</span></div>
                <div><StatusBadge label={mission.status} tone={statusTone(mission.status)} /></div>
                <div className="mission-row-action"><button className="button" type="button" onClick={() => router.push(`/missions/${mission.id}/plan`)} title="Open this mission definition in the planner">Open planner <ArrowUpRight size={13} aria-hidden="true" /></button></div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="notice"><strong>Definition vs. run:</strong> editing a mission changes the reusable plan. Starting it creates a run with its own seed, telemetry stream, event history, and replay.</div>
    </main>
  );
}
