import Link from "next/link";
import { ArrowUpRight, Database, Map, Radio, ShieldCheck } from "lucide-react";

import { OverviewField } from "@/components/overview-field";
import { DemoLaunchButton } from "@/components/demo-launch-button";
import { StatusBadge } from "@/components/status-badge";

export default function HomePage() {
  return (
    <main className="main home-main">
      <div className="home-hero-layout">
        <section className="hero">
          <div className="eyebrow">Mission control / overview</div>
          <h1>Plan and analyze simulated UAV operations.</h1>
          <p>
            Sentinel is a benign UAV operations simulator built to make distributed-systems
            behavior visible: deterministic movement, unreliable communications, durable
            telemetry, replay, and evidence-backed operational analysis.
          </p>
          <div className="hero-actions">
            <div className="hero-action-block">
              <DemoLaunchButton />
              <span className="action-help">Creates the seeded Angeles Forest run and opens its live operations view.</span>
            </div>
            <div className="hero-action-block">
              <Link className="button" href="/missions"><Map size={14} aria-hidden="true" />Open mission catalog</Link>
              <span className="action-help">Inspect mission definitions, routes, and readiness before a run.</span>
            </div>
          </div>
          <div className="home-context">
            <StatusBadge label="Simulation console" tone="neutral" />
            <span><strong>Operational loop:</strong> define, observe, review</span>
          </div>
        </section>
        <OverviewField />
      </div>

      <section className="workflow-section" aria-labelledby="workflow-heading">
        <div className="section-heading">
          <div><div className="eyebrow">Mission lifecycle</div><h2 id="workflow-heading">Plan, operate, review.</h2></div>
          <span className="section-aside">Definition → execution → evidence</span>
        </div>
        <div className="workflow-grid">
          <Link className="workflow-step" href="/missions">
            <span className="workflow-index">01 / DEFINE</span>
            <h2>Plan the mission <ArrowUpRight size={15} aria-hidden="true" /></h2>
            <p>Assemble the fleet, place route points, and resolve preflight blockers before the run can start.</p>
            <span className="workflow-link">Open mission catalog</span>
          </Link>
          <div className="workflow-step">
            <span className="workflow-index">02 / OPERATE</span>
            <h2>Observe the system <Radio size={15} aria-hidden="true" /></h2>
            <p>Follow live telemetry, connection health, persisted metrics, event severity, and simulated faults.</p>
            <span className="workflow-link">Available from a run</span>
          </div>
          <div className="workflow-step">
            <span className="workflow-index">03 / REVIEW</span>
            <h2>Replay the evidence <Database size={15} aria-hidden="true" /></h2>
            <p>Use durable telemetry and events to inspect what happened without rerunning the simulator.</p>
            <span className="workflow-link">Available after launch</span>
          </div>
        </div>
      </section>

      <section className="card home-safety-card" aria-label="Safety boundary">
          <div className="eyebrow">Safety boundary</div>
          <h2>Analysis without command authority</h2>
          <p>Operational analysis can summarize simulated data and link to supporting events. It cannot modify missions, command vehicles, target people, or control payloads.</p>
          <div className="home-context"><ShieldCheck size={15} aria-hidden="true" /><span>Read-only analysis / simulation-only operations</span></div>
      </section>
    </main>
  );
}
