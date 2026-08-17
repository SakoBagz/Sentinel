export type MissionReadinessInput = {
  name: string;
  nameSaved: boolean;
  vehicleCount: number;
  routedVehicleCount: number;
  hasSharedRoute: boolean;
  mapReady: boolean;
};

export type MissionReadinessCheck = {
  id: "identity" | "saved" | "fleet" | "routes" | "map";
  label: string;
  detail: string;
  ready: boolean;
};

export type MissionReadiness = {
  ready: boolean;
  checks: MissionReadinessCheck[];
};

export function evaluateMissionReadiness(input: MissionReadinessInput): MissionReadiness {
  const hasName = input.name.trim().length > 0;
  const hasFleet = input.vehicleCount > 0;
  const routesReady = hasFleet && (input.hasSharedRoute || input.routedVehicleCount === input.vehicleCount);

  const checks: MissionReadinessCheck[] = [
    {
      id: "identity",
      label: "Mission identity",
      detail: hasName ? "Named operation" : "Add a mission name",
      ready: hasName,
    },
    {
      id: "saved",
      label: "Configuration saved",
      detail: input.nameSaved ? "Latest mission changes are persisted" : "Save pending mission changes before launch",
      ready: input.nameSaved,
    },
    {
      id: "fleet",
      label: "Fleet assigned",
      detail: hasFleet ? `${input.vehicleCount} UAV${input.vehicleCount === 1 ? "" : "s"} assigned` : "Assign at least one UAV",
      ready: hasFleet,
    },
    {
      id: "routes",
      label: "Routes complete",
      detail: routesReady
        ? input.hasSharedRoute
          ? "Shared route covers the fleet"
          : `${input.routedVehicleCount}/${input.vehicleCount} UAV routes ready`
        : `${input.routedVehicleCount}/${input.vehicleCount} UAV routes ready`,
      ready: routesReady,
    },
    {
      id: "map",
      label: "Basemap available",
      detail: input.mapReady ? "Geographic context loaded" : "Waiting for map data",
      ready: input.mapReady,
    },
  ];

  return { ready: checks.every((check) => check.ready), checks };
}
