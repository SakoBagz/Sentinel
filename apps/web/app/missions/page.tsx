"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { createMission, listMissions, Mission } from "@/lib/api";
import {
  formatMissionDate,
  missionScenarioOptions,
  missionStatusOptions,
  scenarioLabel,
  statusLabel,
  type MissionScenario,
  type MissionStatus,
} from "@/lib/mission-catalog";

type StatusFilter = "ALL" | MissionStatus;

export default function MissionsPage() {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [scenarioFilter, setScenarioFilter] = useState<"ALL" | MissionScenario>("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftScenario, setDraftScenario] = useState<MissionScenario>("environmental_survey");
  const [draftDescription, setDraftDescription] = useState("");

  const loadMissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMissions(await listMissions());
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to load missions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMissions();
  }, [loadMissions]);

  useEffect(() => {
    if (!createOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setCreateOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, createOpen]);

  const filteredMissions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return missions.filter((mission) => {
      const matchesQuery = !normalizedQuery || [
        mission.name,
        mission.description ?? "",
        scenarioLabel(mission.scenario_type),
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesStatus = statusFilter === "ALL" || mission.status === statusFilter;
      const matchesScenario = scenarioFilter === "ALL" || mission.scenario_type === scenarioFilter;
      return matchesQuery && matchesStatus && matchesScenario;
    });
  }, [missions, query, scenarioFilter, statusFilter]);

  const openCreate = () => {
    setDraftName("");
    setDraftScenario("environmental_survey");
    setDraftDescription("");
    setCreateError(null);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (!busy) setCreateOpen(false);
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) {
      setCreateError("Enter a name for this mission definition.");
      return;
    }
    setBusy(true);
    setCreateError(null);
    try {
      const mission = await createMission({
        name,
        description: draftDescription.trim() || undefined,
        scenario_type: draftScenario,
      });
      router.push(`/missions/${mission.id}/plan`);
    } catch (reason: unknown) {
      setCreateError(reason instanceof Error ? reason.message : "Unable to create mission");
    } finally {
      setBusy(false);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("ALL");
    setScenarioFilter("ALL");
  };

  return (
    <main className="main">
      <PageHeader
        eyebrow="Mission catalog / definitions"
        title="Mission definitions"
        description="A definition holds the reusable objective, fleet, and route. Each execution is created as a separate run with its own seed and history."
        actions={<button className="button primary" type="button" onClick={openCreate}><Plus size={14} aria-hidden="true" /> New mission</button>}
      />

      {error && (
        <div className="notice error" role="alert">
          <strong>Mission catalog unavailable.</strong> {error}
          <button className="button" type="button" onClick={() => void loadMissions()} disabled={loading}>Retry</button>
        </div>
      )}

      <section aria-labelledby="mission-list-heading">
        <div className="catalog-toolbar">
          <div>
            <div className="eyebrow">Reusable configurations</div>
            <p id="mission-list-heading">
              {loading ? "Loading mission definitions…" : `${filteredMissions.length} of ${missions.length} definition${missions.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <span className="section-aside">Search by name, objective, or operation type</span>
        </div>

        <div className="catalog-controls" aria-label="Mission filters">
          <label className="input-with-icon catalog-search">
            <Search size={14} aria-hidden="true" />
            <span className="sr-only">Search mission definitions</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search definitions" />
          </label>
          <label className="catalog-filter">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="ALL">All states</option>
              {missionStatusOptions.map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}
            </select>
          </label>
          <label className="catalog-filter">
            <span>Operation</span>
            <select value={scenarioFilter} onChange={(event) => setScenarioFilter(event.target.value as "ALL" | MissionScenario)}>
              <option value="ALL">All operation types</option>
              {missionScenarioOptions.map((scenario) => <option value={scenario.value} key={scenario.value}>{scenario.label}</option>)}
            </select>
          </label>
          {(query || statusFilter !== "ALL" || scenarioFilter !== "ALL") && (
            <button className="button catalog-clear" type="button" onClick={clearFilters}>Clear filters</button>
          )}
        </div>

        {loading ? (
          <div className="surface loading-state" role="status">Loading mission definitions…</div>
        ) : missions.length === 0 ? (
          <div className="surface empty-state">
            <strong>No mission definitions yet.</strong>
            <p>Start with a named operation and scenario type, then define its fleet and route in the planner.</p>
            <button className="button" type="button" onClick={openCreate}><Plus size={14} aria-hidden="true" /> Create a mission definition</button>
          </div>
        ) : filteredMissions.length === 0 ? (
          <div className="surface empty-state">
            <strong>No definitions match these filters.</strong>
            <p>Adjust the search or state filters to view another operation.</p>
            <button className="button" type="button" onClick={clearFilters}>Clear filters</button>
          </div>
        ) : (
          <div className="mission-list">
            <div className="mission-row mission-table-header" aria-hidden="true">
              <span className="table-label">Definition</span>
              <span className="table-label">Configuration</span>
              <span className="table-label">State</span>
              <span />
            </div>
            {filteredMissions.map((mission) => (
              <article className="mission-row" key={mission.id}>
                <div className="mission-name">
                  <strong>{mission.name}</strong>
                  <span>{scenarioLabel(mission.scenario_type)}</span>
                  {mission.description && <span className="mission-description">{mission.description}</span>}
                  <span className="mission-updated">Updated {formatMissionDate(mission.updated_at)}</span>
                </div>
                <div className="mission-meta">
                  <span><strong>{mission.vehicles.length}</strong> UAV{mission.vehicles.length === 1 ? "" : "s"}</span>
                  <span><strong>{mission.waypoints.length}</strong> route point{mission.waypoints.length === 1 ? "" : "s"}</span>
                </div>
                <div><StatusBadge label={statusLabel(mission.status)} tone={statusTone(mission.status)} /></div>
                <div className="mission-row-action">
                  <button className="button" type="button" onClick={() => router.push(`/missions/${mission.id}/plan`)} title={`Open ${mission.name} in the planner`}>
                    Open planner <ArrowUpRight size={13} aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="notice"><strong>Definition and run:</strong> edit the definition to change the reusable plan. Creating a run snapshots the current fleet and route, then records telemetry and events independently.</div>

      {createOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreate(); }}>
          <section className="mission-dialog" role="dialog" aria-modal="true" aria-labelledby="create-mission-heading">
            <header className="dialog-header">
              <div><div className="eyebrow">New definition</div><h2 id="create-mission-heading">Create a mission</h2><p>Name the operation before adding its fleet and route.</p></div>
              <button className="icon-button" type="button" onClick={closeCreate} disabled={busy} aria-label="Close create mission dialog"><X size={16} aria-hidden="true" /></button>
            </header>
            <form className="dialog-form" onSubmit={create}>
              <label className="field">Mission name<input autoFocus required maxLength={200} value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="North ridge survey" aria-describedby="create-name-help" /></label>
              <p id="create-name-help" className="field-help">Use a specific operational name that will still make sense in a run history.</p>
              <label className="field">Operation type<select value={draftScenario} onChange={(event) => setDraftScenario(event.target.value as MissionScenario)}>{missionScenarioOptions.map((scenario) => <option value={scenario.value} key={scenario.value}>{scenario.label}</option>)}</select></label>
              <p className="field-help">{missionScenarioOptions.find((scenario) => scenario.value === draftScenario)?.description}</p>
              <label className="field">Objective / notes <span className="field-optional">Optional</span><textarea maxLength={2000} rows={4} value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} placeholder="Describe the area, collection objective, or review question." /></label>
              {createError && <div className="notice error" role="alert">{createError}</div>}
              <div className="dialog-actions"><button className="button" type="button" onClick={closeCreate} disabled={busy}>Cancel</button><button className="button primary" type="submit" disabled={busy}>{busy ? "Creating definition…" : "Create definition"}</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
