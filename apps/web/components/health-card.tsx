"use client";

import { useEffect, useState } from "react";

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

  const ready = health?.status === "ok";
  return (
    <div className="card">
      <div className="eyebrow">Service status</div>
      <p className="status" style={{ color: ready ? "var(--accent)" : "var(--warning)", marginTop: 14 }}>
        <span className="status-dot" /> {health?.status === "unavailable" ? "starting service…" : health?.status ?? "checking"}
      </p>
      <div className="metric"><span>PostgreSQL</span><strong>{health?.dependencies.postgres ?? "—"}</strong></div>
      <div className="metric"><span>Redis / Valkey</span><strong>{health?.dependencies.redis ?? "—"}</strong></div>
    </div>
  );
}
