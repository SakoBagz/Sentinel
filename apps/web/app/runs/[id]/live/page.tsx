import { LiveOperations } from "@/components/live-operations";

export default async function LiveRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveOperations runId={id} />;
}
