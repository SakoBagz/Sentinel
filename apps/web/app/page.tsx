import Link from "next/link";

import { HealthCard } from "@/components/health-card";

export default function HomePage() {
  return (
    <>
      <header className="topbar">
        <div className="brand">SENTINEL</div>
        <div className="eyebrow">Mission operations / simulation</div>
      </header>
      <main className="main">
        <section className="hero">
          <div className="eyebrow">Portfolio engineering platform</div>
          <h1>Coordinate the mission. Understand the system.</h1>
          <p>
            Sentinel simulates benign UAV operations through deterministic movement,
            unreliable communications, durable telemetry, replay, and evidence-grounded
            mission analysis.
          </p>
          <div className="actions">
            <Link className="button primary" href="/missions">Open mission control</Link>
            <Link className="button" href="/missions/demo/plan">View planner</Link>
          </div>
        </section>
        <section className="grid">
          <HealthCard />
          <div className="card"><div className="eyebrow">Mode</div><h2 style={{ marginTop: 14 }}>Development skeleton</h2><p>Phase 1 services are wired for PostgreSQL, Redis/Valkey, FastAPI, and Next.js.</p></div>
          <div className="card"><div className="eyebrow">Safety boundary</div><h2 style={{ marginTop: 14 }}>Read-only analysis</h2><p>The Mission Analyst explains simulated operations; it cannot control vehicles or modify mission state.</p></div>
        </section>
        <div className="notice">Public Portfolio Demo Mode will intentionally limit cloud simulation capacity. Benchmark results are measured locally and disclosed with hardware details.</div>
      </main>
    </>
  );
}

