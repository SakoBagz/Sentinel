export const missionScenarioOptions = [
  {
    value: "search_and_rescue",
    label: "Search and rescue",
    description: "Coordinate a simulated search grid and document coverage.",
  },
  {
    value: "wildfire_monitoring",
    label: "Wildfire monitoring",
    description: "Survey a simulated fire perimeter and monitor change over time.",
  },
  {
    value: "environmental_survey",
    label: "Environmental survey",
    description: "Collect simulated observations across a defined area.",
  },
  {
    value: "infrastructure_inspection",
    label: "Infrastructure inspection",
    description: "Inspect a simulated corridor, asset, or linear structure.",
  },
  {
    value: "mapping",
    label: "Mapping",
    description: "Build a repeatable simulated mapping route.",
  },
  {
    value: "communications_relay",
    label: "Communications relay",
    description: "Evaluate simulated relay coverage and network behavior.",
  },
  {
    value: "angeles_forest_survey",
    label: "Angeles Forest survey",
    description: "Run the canonical benign wildfire and environmental survey scenario.",
  },
] as const;

export type MissionScenario = typeof missionScenarioOptions[number]["value"];

export const missionStatusOptions = [
  "DRAFT",
  "READY",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "ABORTED",
] as const;

export type MissionStatus = typeof missionStatusOptions[number];

const scenarioLabels = new Map<string, string>(missionScenarioOptions.map((option) => [option.value, option.label]));

export function scenarioLabel(value: string | null): string {
  if (!value) return "General operation";
  return scenarioLabels.get(value) ?? value.replaceAll("_", " ");
}

export function statusLabel(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function formatMissionDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
