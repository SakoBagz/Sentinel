import { MissionPlanner } from "@/components/mission-planner";

export default async function PlannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MissionPlanner missionId={id} />;
}
