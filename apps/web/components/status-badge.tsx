import type { ReactNode } from "react";

export type StatusTone = "neutral" | "positive" | "warning" | "critical";

const toneSymbols: Record<StatusTone, string> = {
  neutral: "—",
  positive: "●",
  warning: "!",
  critical: "×",
};

export function StatusBadge({
  label,
  tone = "neutral",
  detail,
  className = "",
}: {
  label: string;
  tone?: StatusTone;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <span className={`status-badge ${tone} ${className}`.trim()} role="status">
      <span className="status-symbol" aria-hidden="true">{toneSymbols[tone]}</span>
      <span>{label}</span>
      {detail && <span className="status-detail">{detail}</span>}
    </span>
  );
}

export function statusTone(status: string): StatusTone {
  if (["HEALTHY", "LIVE", "READY", "RUNNING", "COMPLETED", "GO"].includes(status)) return "positive";
  if (["DEGRADED", "STALE", "RECONNECTING", "PAUSED", "HOLD", "DRAFT"].includes(status)) return "warning";
  if (["DISCONNECTED", "ABORTED", "CRITICAL"].includes(status)) return "critical";
  return "neutral";
}
