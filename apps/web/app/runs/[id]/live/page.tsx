export default async function LiveRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="main"><div className="eyebrow">Live operations / {id}</div><h1>Run telemetry</h1><div className="workspace"><aside className="rail"><div className="eyebrow">Fleet</div><div className="list"><div className="list-item"><strong>UAV-001 ●</strong><span>EXECUTING · HEALTHY</span></div><div className="list-item"><strong>UAV-002 ●</strong><span>EXECUTING · HEALTHY</span></div></div></aside><section className="map"><span>Realtime map surface — WebSocket integration follows Phase 4.</span></section><aside className="inspector"><div className="eyebrow">Vehicle detail</div><div className="metric"><span>State</span><strong>EXECUTING</strong></div><div className="metric"><span>Battery</span><strong>—</strong></div><div className="metric"><span>Sequence</span><strong>—</strong></div></aside></div></main>;
}

