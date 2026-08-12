export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="main"><div className="eyebrow">Replay / {id}</div><h1>Historical mission</h1><div className="card"><p>Replay controls and persisted telemetry will be enabled after the durable run pipeline is complete.</p></div></main>;
}

