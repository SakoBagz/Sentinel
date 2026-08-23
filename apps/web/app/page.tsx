import Link from "next/link";
import { ArrowUpRight, Database, Map, Radio, ShieldCheck } from "lucide-react";

import { OverviewField } from "@/components/overview-field";
import { DemoLaunchButton } from "@/components/demo-launch-button";

export default function HomePage() {
  return (
    <main className="main home-main">
      <section className="home-hero" aria-labelledby="sentinel-brand">
        <OverviewField />
        <div className="home-hero-content">
          <h1 id="sentinel-brand" className="hero-enter" style={{ ["--enter-delay" as string]: "40ms" }}>
            SENTINEL
          </h1>
          <h2 className="hero-enter" style={{ ["--enter-delay" as string]: "110ms" }}>
            See the mission. Trust the evidence.
          </h2>
          <p className="hero-enter" style={{ ["--enter-delay" as string]: "170ms" }}>
            Plan simulated UAV runs, observe unreliable systems in real time, and replay every operational decision.
          </p>
          <div className="hero-actions hero-enter" style={{ ["--enter-delay" as string]: "230ms" }}>
            <DemoLaunchButton />
            <Link className="button" href="/missions">
              <Map size={14} aria-hidden="true" />
              Open mission catalog
            </Link>
          </div>
          <p className="home-hero-meta hero-enter" style={{ ["--enter-delay" as string]: "290ms" }}>
            Simulated vehicles only · no physical control authority
          </p>
        </div>
      </section>

      <div className="home-below-fold">
        <section className="workflow-section" aria-labelledby="workflow-heading">
          <div className="section-heading workflow-heading">
            <h2 id="workflow-heading">Plan, operate, review.</h2>
            <p>Definition becomes execution becomes durable evidence.</p>
          </div>
          <div className="workflow-grid">
            <Link className="workflow-step workflow-step-primary" href="/missions">
              <span className="workflow-index">Define</span>
              <h3>
                Plan the mission <ArrowUpRight size={15} aria-hidden="true" />
              </h3>
              <p>Assemble the fleet, place route points, and resolve preflight blockers before the run can start.</p>
              <span className="workflow-link">Open mission catalog</span>
            </Link>
            <div className="workflow-step">
              <span className="workflow-index">Operate</span>
              <h3>
                Observe the system <Radio size={15} aria-hidden="true" />
              </h3>
              <p>Follow live telemetry, connection health, persisted metrics, event severity, and simulated faults.</p>
              <span className="workflow-link">Available from a run</span>
            </div>
            <div className="workflow-step">
              <span className="workflow-index">Review</span>
              <h3>
                Replay the evidence <Database size={15} aria-hidden="true" />
              </h3>
              <p>Use durable telemetry and events to inspect what happened without rerunning the simulator.</p>
              <span className="workflow-link">Available after launch</span>
            </div>
          </div>
        </section>

        <section className="home-safety" aria-label="Safety boundary">
          <ShieldCheck size={16} aria-hidden="true" />
          <div>
            <h2>Analysis without command authority</h2>
            <p>
              Operational analysis can summarize simulated data and link to supporting events. It cannot modify
              missions, command vehicles, target people, or control payloads.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
