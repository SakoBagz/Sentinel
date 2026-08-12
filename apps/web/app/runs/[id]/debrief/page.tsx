import { DebriefDashboard } from "@/components/debrief-dashboard";

export default async function DebriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DebriefDashboard runId={id} />;
}
