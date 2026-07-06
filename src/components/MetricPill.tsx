import type { ReactNode } from "react";

export function MetricPill({ label, value, compact }: { label: string; value: ReactNode; compact?: boolean }) {
  return (
    <div className="metric-pill">
      <div className="metric-label">{label}</div>
      <div className={compact ? "metric-value metric-value-compact" : "metric-value"}>{value}</div>
    </div>
  );
}
