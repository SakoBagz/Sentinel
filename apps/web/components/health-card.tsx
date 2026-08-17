"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { StatusBadge, statusTone } from "@/components/status-badge";

type Health = { status: string; service: string; dependencies: Record<string, string> };

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export function HealthCard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const delay = Math.min(8_000, 500 * 2 ** Math.min(attempt, 4));
    const timer = setTimeout(() => {
      fetch(`${apiBase}/api/health`, { signal: controller.signal })
        .then((response) => { if (!response.ok) throw new Error("health failed"); return response.json() as Promise<Health>; })
        .then((value) => { if (active) { setHealth(value); if (value.status !== "ok") setAttempt((value) => value + 1); } })
        .catch(() => { if (active) { setHealth({ status: "unavailable", service: "api", dependencies: {} }); if (attempt < 5) setAttempt((value) => value + 1); } });
    }, delay);
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [attempt]);

  return (
    <div className="card" aria-label="Runtime dependencies">
      <div className="section-heading">
        <div><div className="eyebrow">Runtime dependencies</div><h2>Service status</h2></div>
        <StatusBadge label={health?.status === "unavailable" ? "Unavailable" : health?.status === "ok" ? "Healthy" : "Checking"} tone={statusTone(health?.status === "unavailable" ? "DISCONNECTED" : health?.status === "ok" ? "HEALTHY" : "STALE")} />
      </div>
      <p className="card-copy">The API reports whether PostgreSQL and Redis/Valkey are available before a mission is launched.</p>
      <div className="metric"><span>PostgreSQL</span><strong>{health?.dependencies.postgres ?? "Checking"}</strong></div>
      <div className="metric"><span>Redis / Valkey</span><strong>{health?.dependencies.redis ?? "Checking"}</strong></div>
      <button className="button" type="button" onClick={() => setAttempt((value) => value + 1)} title="Run the dependency health check again">
        <RefreshCw size={13} aria-hidden="true" /> Check again
      </button>
    </div>
  );
}
