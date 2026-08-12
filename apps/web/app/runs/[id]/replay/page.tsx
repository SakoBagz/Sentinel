import { Suspense } from "react";

import { ReplayViewer } from "@/components/replay-viewer";

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<main className="main"><div className="card">Loading replay…</div></main>}><ReplayViewer runId={id} /></Suspense>;
}
