"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createMission, listMissions, Mission } from "@/lib/api";

export default function MissionsPage() {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { listMissions().then(setMissions).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "API unavailable")); }, []);
  const create = async () => {
    const mission = await createMission({ name: "New survey mission", scenario_type: "environmental_survey" });
    router.push(`/missions/${mission.id}/plan`);
  };
  return (
    <main className="main">
      <div className="eyebrow">Mission catalog</div>
      <h1>Mission definitions</h1>
      <div className="grid">
        {missions.map((mission) => <div className="card" key={mission.id}><h2>{mission.name}</h2><p>{mission.scenario_type ?? "General operation"} · {mission.vehicles.length} UAVs · {mission.status}</p><div className="actions"><button className="button primary" onClick={() => router.push(`/missions/${mission.id}/plan`)}>Open planner</button></div></div>)}
        <div className="card"><h2>Create mission</h2><p>{error ?? "Start a reusable mission definition and add vehicles and routes."}</p><div className="actions"><button className="button" onClick={create}>Start draft</button></div></div>
      </div>
    </main>
  );
}
