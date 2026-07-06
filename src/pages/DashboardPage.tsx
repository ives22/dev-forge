import { Activity, Clipboard, Command, Database, Sparkles, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { readClipboardText } from "../lib/desktop";
import { usePageChrome } from "../hooks/usePageChrome";
import { runnableTools, toolById } from "../lib/toolRegistry";
import type { ToolId } from "../lib/toolRegistry";
import type { UsageRecord, UsageSummary } from "../lib/storage";
import { byteSize, formatBytes } from "../lib/utils";

function classifyClipboard(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "空";
  if (/^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\./.test(trimmed)) return "JWT";
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) return "JSON";
  if (/^https?:\/\//.test(trimmed)) return "URL";
  if (/^[A-Za-z0-9+/_=-]{24,}$/.test(trimmed)) return "Base64";
  return "文本";
}

function formatActivityTime(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "--";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    copy: "复制",
    "copy-result": "复制结果",
    "copy-replace": "复制替换",
    run: "运行",
    format: "格式化",
    compact: "压缩",
    convert: "转换",
    calculate: "计算",
    diff: "时间差",
    encode: "编码",
    decode: "解码",
    generate: "生成",
    save: "保存",
    scan: "扫描",
    lookup: "查询"
  };
  return labels[action] ?? action;
}

function statusLabel(status: UsageRecord["status"]): string {
  if (status === "ok") return "成功";
  if (status === "warn") return "告警";
  return "错误";
}

function formatResponseMs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-MS";
  return `${Math.max(0.1, value).toFixed(1)}MS`;
}

function formatTrend(value: number): string {
  const normalized = Number.isFinite(value) ? value : 0;
  if (normalized > 0) return `↑ ${Math.abs(normalized)}%`;
  if (normalized < 0) return `↓ ${Math.abs(normalized)}%`;
  return "→ 0%";
}

function trendClass(value: number): string | undefined {
  if (value < 0) return "trend-negative";
  if (value === 0) return "trend-neutral";
  return undefined;
}

export function DashboardPage({
  usage,
  summary,
  favoriteToolIds,
  shortcutRegistered,
  onOpenPalette
}: {
  usage: UsageRecord[];
  summary: UsageSummary;
  favoriteToolIds: ToolId[];
  shortcutRegistered: boolean;
  onOpenPalette: () => void;
}) {
  const [clipboard, setClipboard] = useState<{ type: string; size: string; sample: string }>({ type: "未检测", size: "-", sample: "" });
  const usageCountByTool = useMemo(
    () => new Map(summary.toolCounts.map((item) => [item.tool_id, item.count])),
    [summary.toolCounts]
  );
  const quickToolIds = useMemo(() => {
    const fallbackToolIds: ToolId[] = ["json-yaml", "url", "bandwidth", "timestamp"];
    return Array.from(new Set<ToolId>([...favoriteToolIds, ...summary.toolCounts.map((item) => item.tool_id), ...fallbackToolIds])).slice(0, 4);
  }, [favoriteToolIds, summary.toolCounts]);
  const metrics = [
    { label: "工具", value: runnableTools.length },
    { label: "今日", value: summary.todayUsage },
    { label: "总使用", value: summary.totalUsage },
    { label: "存储", value: summary.backend === "sqlite" ? "SQLite" : "本地", compact: true }
  ];
  usePageChrome({
    tool: toolById.dashboard,
    metrics
  });

  const inspectClipboard = async () => {
    const text = await readClipboardText();
    setClipboard({
      type: classifyClipboard(text),
      size: formatBytes(byteSize(text)),
      sample: text.replace(/\s+/g, " ").slice(0, 140)
    });
  };

  return (
    <section className="tool-shell dashboard-shell">
      <h1 className="sr-only">工作台</h1>
      <section className="dashboard-stat-strip" aria-label="工作台指标">
        <article className="dashboard-stat-card stat-green" aria-label="工具总数">
          <span>工具总数</span>
          <strong>{runnableTools.length}</strong>
          <em className={trendClass(summary.toolCountTrendPercent)}>{formatTrend(summary.toolCountTrendPercent)}</em>
        </article>
        <article className="dashboard-stat-card stat-blue" aria-label="今日使用">
          <span>今日使用</span>
          <strong>{summary.todayUsage}</strong>
          <em className={trendClass(summary.todayUsageTrendPercent)}>{formatTrend(summary.todayUsageTrendPercent)}</em>
        </article>
        <article className="dashboard-stat-card stat-purple" aria-label="剪贴板操作">
          <span>剪贴板操作</span>
          <strong>{summary.clipboardActions}</strong>
          <em className={trendClass(summary.clipboardTrendPercent)}>{formatTrend(summary.clipboardTrendPercent)}</em>
        </article>
        <article className="dashboard-stat-card stat-orange" aria-label="平均响应">
          <span>平均响应</span>
          <strong>{formatResponseMs(summary.averageResponseMs)}</strong>
          <em>↑ 快速</em>
        </article>
      </section>

      <div className="dashboard-grid">
        <div className="dashboard-column dashboard-primary-column">
          <section className="dashboard-tool-section" aria-label="常用工具">
            <div className="dashboard-section-heading">
              <div>
                <span>常用工具</span>
                <strong>按收藏与使用记录排序</strong>
              </div>
              <button className="tool-action" type="button" onClick={onOpenPalette}>
                <Command size={14} /> 命令面板
              </button>
            </div>
            <div className="dashboard-tools">
              {quickToolIds.map((id) => {
                const tool = toolById[id];
                const Icon = tool.icon;
                const usageCount = usageCountByTool.get(tool.id) ?? 0;
                return (
                  <Link key={tool.id} className="mini-tool" to={tool.route}>
                    <div>
                      <div className="mini-tool-top">
                        <span className={`mini-tool-icon accent-${tool.accent}`}>
                          <Icon size={16} />
                        </span>
                        <span className="mini-tool-name">{tool.shortTitle}</span>
                      </div>
                      <div className="mini-tool-desc">{tool.description}</div>
                    </div>
                    <div className="mini-tool-meta">
                      <span className="tool-shortcut">{tool.shortcut}</span>
                      <span>{usageCount ? `${usageCount} 次` : "未使用"}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
        <div className="dashboard-side-grid">
          <section className="compact-panel dashboard-activity-panel" aria-label="最近活动">
            <div className="compact-panel-title">
              <Sparkles size={15} /> 最近活动
            </div>
            <div className="dashboard-activity-list">
              {usage.length ? (
                usage.slice(0, 6).map((item) => (
                  <Link className="activity-row" to={toolById[item.tool_id]?.route ?? "/"} key={item.id}>
                    <span className={`activity-icon accent-${toolById[item.tool_id]?.accent ?? "slate"}`}>
                      {(() => {
                        const Icon = toolById[item.tool_id]?.icon ?? Activity;
                        return <Icon size={14} />;
                      })()}
                    </span>
                    <span className="activity-body">
                      <span className="activity-title">
                        <strong>{toolById[item.tool_id]?.shortTitle ?? item.tool_id}</strong>
                        <em>{actionLabel(item.action)}</em>
                      </span>
                      <span className="activity-preview">{item.output_preview || item.input_preview || "无预览内容"}</span>
                    </span>
                    <span className="activity-meta">
                      <code className={`usage-status ${item.status}`}>{statusLabel(item.status)}</code>
                      <time>{formatActivityTime(item.created_at)}</time>
                    </span>
                  </Link>
                ))
              ) : (
                <div className="empty-state">暂无活动记录。</div>
              )}
            </div>
          </section>
          <section className="compact-panel">
            <div className="compact-panel-title">
              <Database size={15} /> 工具健康
            </div>
            <div className="tiny-list">
              <div className="tiny-row">
                <span>运行模式</span>
                <code>本地优先</code>
              </div>
              <div className="tiny-row">
                <span>存储</span>
                <code>{summary.backend === "sqlite" ? "SQLite" : "浏览器回退"}</code>
              </div>
              <div className="tiny-row">
                <span>快捷键</span>
                <code>{shortcutRegistered ? "已启用" : "待授权"}</code>
              </div>
              <div className="tiny-row">
                <span>成功 / 告警 / 错误</span>
                <code>
                  {summary.okCount} / {summary.warnCount} / {summary.errorCount}
                </code>
              </div>
            </div>
          </section>
          <section className="compact-panel">
            <div className="compact-panel-title">
              <Clipboard size={15} /> 剪贴板检测
              <button className="tool-action" type="button" onClick={inspectClipboard}>检测</button>
            </div>
            <div className="result-grid">
              <div className="result-card">
                <div className="result-label">类型</div>
                <div className="result-value">{clipboard.type}</div>
              </div>
              <div className="result-card">
                <div className="result-label">大小</div>
                <div className="result-value">{clipboard.size}</div>
              </div>
              <div className="result-card">
                <div className="result-label">状态</div>
                <div className="result-value">{clipboard.sample ? "Ready" : "Idle"}</div>
              </div>
            </div>
          </section>
          <section className="compact-panel dashboard-favorites-panel" aria-label="收藏夹">
            <div className="compact-panel-title">
              <Star size={15} /> 收藏夹
            </div>
            <div className="tiny-list">
              {favoriteToolIds.length ? (
                favoriteToolIds.map((id) => {
                  const tool = toolById[id];
                  const Icon = tool.icon;
                  return (
                    <Link className="favorite-row" to={tool.route} key={id}>
                      <span className={`favorite-row-icon accent-${tool.accent}`}>
                        <Icon size={14} />
                      </span>
                      <span>{tool.shortTitle}</span>
                      <code>{tool.shortcut}</code>
                    </Link>
                  );
                })
              ) : (
                <div className="empty-state">暂无收藏工具。</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
