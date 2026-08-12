import { ReplayViewer } from "@/components/replay-viewer";

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReplayViewer runId={id} />;
}
