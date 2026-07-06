import type { ReactNode } from "react";
import { MetricPill } from "./MetricPill";
import type { ToolDefinition } from "../lib/toolRegistry";
import type { LucideIcon } from "lucide-react";

export function ToolHeader({
  tool,
  kicker,
  icon,
  metrics
}: {
  tool: ToolDefinition;
  kicker?: ReactNode;
  icon?: LucideIcon;
  metrics?: Array<{ label: string; value: ReactNode; compact?: boolean }>;
}) {
  const Icon = icon ?? tool.icon;
  return (
    <header className="tool-header">
      <div className="tool-heading">
        <div className="tool-heading-icon">
          <Icon size={23} strokeWidth={2.2} />
        </div>
        <div>
          <h1 className="tool-title">{tool.title}</h1>
          <div className="tool-kicker">
            {kicker ?? tool.description} {tool.shortcut ? <code>{tool.shortcut}</code> : null}
          </div>
        </div>
      </div>
      {metrics?.length ? (
        <div className="header-metrics">
          {metrics.map((metric) => (
            <MetricPill key={metric.label} {...metric} />
          ))}
        </div>
      ) : null}
    </header>
  );
}
