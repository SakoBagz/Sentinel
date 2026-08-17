import Link from "next/link";

export type RunView = "live" | "replay" | "debrief";

const views: Array<{ id: RunView; label: string; description: string }> = [
  { id: "live", label: "Live operations", description: "Current telemetry and controls" },
  { id: "replay", label: "Replay", description: "Persisted historical state" },
  { id: "debrief", label: "Debrief", description: "Metrics and evidence" },
];

export function RunNavigation({ runId, active }: { runId: string; active: RunView }) {
  return (
    <nav className="run-navigation" aria-label="Run views">
      {views.map((view) => (
        <Link
          className={`run-tab ${active === view.id ? "active" : ""}`}
          href={`/runs/${runId}/${view.id}`}
          aria-current={active === view.id ? "page" : undefined}
          key={view.id}
          title={view.description}
        >
          <span>{view.label}</span>
          <small>{view.description}</small>
        </Link>
      ))}
    </nav>
  );
}
