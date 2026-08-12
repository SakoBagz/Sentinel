export default async function DebriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="main"><div className="eyebrow">Debrief / {id}</div><h1>Mission analysis</h1><div className="card"><p>Deterministic metrics and the read-only Mission Analyst will appear after the run pipeline is implemented.</p></div></main>;
}

