"use client";

import { useEffect, useState } from "react";

type Health = { status: string; service: string; dependencies: Record<string, string> };

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export function HealthCard() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${apiBase}/api/health`)
      .then((response) => response.json() as Promise<Health>)
      .then((value) => { if (active) setHealth(value); })
      .catch(() => { if (active) setHealth({ status: "unavailable", service: "api", dependencies: {} }); });
    return () => { active = false; };
  }, []);

  const ready = health?.status === "ok";
  return (
    <div className="card">
      <div className="eyebrow">Service status</div>
      <p className="status" style={{ color: ready ? "var(--accent)" : "var(--warning)", marginTop: 14 }}>
        <span className="status-dot" /> {health?.status ?? "checking"}
      </p>
      <div className="metric"><span>PostgreSQL</span><strong>{health?.dependencies.postgres ?? "—"}</strong></div>
      <div className="metric"><span>Redis / Valkey</span><strong>{health?.dependencies.redis ?? "—"}</strong></div>
    </div>
  );
}

