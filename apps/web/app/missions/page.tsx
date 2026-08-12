import Link from "next/link";

export default function MissionsPage() {
  return (
    <main className="main">
      <div className="eyebrow">Mission catalog</div>
      <h1>Mission definitions</h1>
      <div className="grid">
        <div className="card"><h2>Angeles Forest Survey</h2><p>25 UAVs · wildfire/environmental survey · deterministic demo scenario.</p><div className="actions"><Link className="button primary" href="/missions/demo/plan">Open planner</Link></div></div>
        <div className="card"><h2>New mission</h2><p>Create a reusable mission definition in the next planner slice.</p><div className="actions"><Link className="button" href="/missions/demo/plan">Start draft</Link></div></div>
      </div>
    </main>
  );
}

