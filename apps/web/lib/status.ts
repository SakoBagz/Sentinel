export type CommunicationsState = "HEALTHY" | "DEGRADED" | "STALE" | "DISCONNECTED" | "RECOVERING";

export function formatCommunicationsState(state: CommunicationsState): string {
  return state.replaceAll("_", " ");
}

