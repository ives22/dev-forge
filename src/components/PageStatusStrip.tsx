import type { PageChromeMetric } from "../hooks/usePageChrome";

export function PageStatusStrip({ metrics }: { metrics: PageChromeMetric[] }) {
  if (!metrics.length) return null;

  return (
    <div className="page-status-strip" aria-label="页面状态">
      {metrics.map((metric) => (
        <span className="page-status-pill" key={metric.label}>
          <span className="page-status-label">{metric.label}</span>
          <span className={`page-status-value ${metric.compact ? "is-compact" : ""}`}>{metric.value}</span>
        </span>
      ))}
    </div>
  );
}
