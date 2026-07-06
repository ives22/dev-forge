import { Copy, Database } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import { HighlightedCodeBlock } from "../components/HighlightedCodeBlock";
import { Button, Field, Panel, SegmentButton, SwitchToggle } from "../components/Panel";
import { usePageChrome } from "../hooks/usePageChrome";
import { copyText } from "../lib/desktop";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import {
  defaultSqlOptions,
  evaluateSql,
  formatSql,
  sqlSample,
  type SqlDialect,
  type SqlFormatOptions,
  type SqlMode
} from "../lib/tools/sql";

const dialectOptions: Array<{ value: SqlDialect; label: string }> = [
  { value: "mysql", label: "MySQL" },
  { value: "postgres", label: "Postgres" },
  { value: "sqlite", label: "SQLite" },
  { value: "sqlserver", label: "SQL Server" }
];

const modeOptions: Array<{ value: SqlMode; label: string }> = [
  { value: "format", label: "格式化" },
  { value: "compact", label: "压缩" },
  { value: "validate", label: "校验" }
];

function dialectLabel(dialect: SqlDialect) {
  return dialectOptions.find((item) => item.value === dialect)?.label ?? dialect;
}

function issueClass(level: "ok" | "warn" | "error") {
  if (level === "error") return "error";
  if (level === "warn") return "warning";
  return "";
}

export function SqlPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [input, setInput] = useState(sqlSample);
  const [mode, setMode] = useState<SqlMode>("format");
  const [options, setOptions] = useState<SqlFormatOptions>(defaultSqlOptions);
  const [copyLabel, setCopyLabel] = useState("复制");
  const highlightRef = useRef<HTMLPreElement>(null);

  const effectiveOptions = useMemo(
    () => ({
      ...options,
      compact: mode === "compact"
    }),
    [mode, options]
  );
  const preview = useMemo(
    () => (mode === "validate" ? evaluateSql(input, { ...effectiveOptions, compact: false }) : evaluateSql(input, effectiveOptions)),
    [effectiveOptions, input, mode]
  );
  const visibleSql = mode === "validate" ? input : preview.output;
  const issueCount = preview.issues.filter((issue) => issue.level !== "ok").length;
  const metrics = [
    { label: "表", value: preview.structure.tables.length },
    { label: "参数", value: preview.structure.parameterCount + preview.structure.conditionCount },
    { label: "行", value: preview.lineCount },
    { label: "状态", value: preview.state, compact: true }
  ];

  usePageChrome({
    tool: toolById.sql,
    kicker: "方言、缩进、结构摘要与风险检查",
    metrics
  });

  const updateOptions = (next: Partial<SqlFormatOptions>) => {
    setOptions((current) => ({ ...current, ...next }));
  };

  const syncHighlightScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (!highlightRef.current) return;
    highlightRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
  };

  const persist = async (action: string, output = visibleSql) => {
    await recordUsage({
      toolId: "sql",
      action,
      input,
      output,
      status: preview.ok ? (issueCount ? "warn" : "ok") : "error"
    });
  };

  const run = async () => {
    if (mode !== "validate") {
      setInput(formatSql(input, effectiveOptions));
    }
    await persist(mode);
  };

  const copyResult = async () => {
    await copyText(visibleSql);
    setCopyLabel("已复制");
    window.setTimeout(() => setCopyLabel("复制"), 900);
    await persist("copy");
  };

  return (
    <section className="tool-shell sql-tool-shell" aria-label="SQL 格式化工具">
      <section className="mode-strip" aria-label="SQL 操作">
        <div className="sql-mode-row">
          <div className="segmented-control sql-dialect-control" role="tablist" aria-label="SQL 方言">
            {dialectOptions.map((item) => (
              <SegmentButton key={item.value} active={options.dialect === item.value} onClick={() => updateOptions({ dialect: item.value })}>
                {item.label}
              </SegmentButton>
            ))}
          </div>
          <div className="segmented-control sql-mode-control" role="tablist" aria-label="SQL 模式">
            {modeOptions.map((item) => (
              <SegmentButton key={item.value} active={mode === item.value} onClick={() => setMode(item.value)}>
                {item.label}
              </SegmentButton>
            ))}
          </div>
        </div>
        <div className="mode-tools sql-action-row">
          <Button onClick={() => setInput(sqlSample)}>示例</Button>
          <Button onClick={() => setInput("")}>清空</Button>
          <Button onClick={() => void copyResult()}>
            <Copy size={14} /> {copyLabel}
          </Button>
          <Button variant="primary" onClick={() => void run()}>
            运行
          </Button>
        </div>
      </section>

      <section className="sql-workbench">
        <div className="sql-main">
          <section className="panel editor-panel sql-editor-panel">
            <div className="panel-topbar">
              <div className="panel-title">
                <Database size={15} aria-hidden="true" /> SQL 编辑器
              </div>
              <div className="panel-actions">
                <span className="format-badge">{preview.charCount} chars</span>
              </div>
            </div>
            <div className="editor-body unified-editor">
              <div className="code-input-shell sql-code-input-shell">
                <HighlightedCodeBlock ref={highlightRef} code={input} format="sql" className="unified-highlight sql-highlight" ariaHidden />
                <textarea
                  className="editor-textarea sql-textarea"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onScroll={syncHighlightScroll}
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                />
              </div>
            </div>
            <div className="editor-footer">
              <span>{`${preview.lineCount} lines · ${dialectLabel(options.dialect)} · ${mode === "format" ? "Format" : mode === "compact" ? "Compact" : "Validate"}`}</span>
              <span className={preview.ok ? "" : "error-text"}>{preview.state}</span>
            </div>
          </section>
        </div>

        <aside className="side-stack sql-side-stack">
          <Panel
            className="sql-structure-panel"
            title="结构摘要"
            actions={<span className={`health-badge ${preview.ok ? (issueCount ? "warning" : "") : "error"}`}>{preview.state}</span>}
          >
            <div className="sql-tree-list">
              {preview.structure.tables.length ? (
                preview.structure.tables.map((table, index) => (
                  <div className="sql-tree-row" key={`${table.source}-${table.name}-${index}`}>
                    <strong>{table.name}</strong>
                    <span className={table.source === "FROM" ? "table-chip" : "join-chip"}>{table.source}</span>
                  </div>
                ))
              ) : (
                <div className="sql-tree-row">
                  <strong>暂无表</strong>
                  <code>-</code>
                </div>
              )}
              <div className="sql-tree-row">
                <strong>select</strong>
                <code>{preview.structure.fieldCount} 字段</code>
              </div>
              <div className="sql-tree-row">
                <strong>join</strong>
                <code>{preview.structure.joinCount} 个</code>
              </div>
              <div className="sql-tree-row">
                <strong>where</strong>
                <code>{preview.structure.conditionCount} 条件</code>
              </div>
            </div>
          </Panel>

          <Panel className="sql-options-panel" title="格式选项">
            <div className="sql-option-list">
              <Field label="缩进空格">
                <select value={options.indent} onChange={(event) => updateOptions({ indent: Number(event.target.value) as 2 | 4 })}>
                  <option value={2}>2 spaces</option>
                  <option value={4}>4 spaces</option>
                </select>
              </Field>
              <SwitchToggle checked={options.uppercaseKeywords} onChange={(checked) => updateOptions({ uppercaseKeywords: checked })} title="关键字大写" />
              <SwitchToggle checked={options.fieldLineBreaks} onChange={(checked) => updateOptions({ fieldLineBreaks: checked })} title="字段逐行" />
              <SwitchToggle checked={options.joinLineBreaks} onChange={(checked) => updateOptions({ joinLineBreaks: checked })} title="JOIN 独立行" />
            </div>
          </Panel>

          <Panel
            className="sql-issues-panel"
            title="检查项"
            actions={<span className={`health-badge ${preview.ok ? (issueCount ? "warning" : "") : "error"}`}>{issueCount ? `${issueCount} issue` : "OK"}</span>}
          >
            <div className="sql-issue-list">
              {preview.issues.map((issue) => (
                <div className={`sql-issue-row ${issueClass(issue.level)}`} key={`${issue.level}-${issue.title}`}>
                  <span className="sql-issue-dot" />
                  <span className="sql-issue-copy">
                    <strong>{issue.title}</strong>
                    <span>{issue.body}</span>
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="sql-cheatsheet-panel" title="速查">
            <div className="tiny-list">
              <div className="tiny-row">
                <span>窗口函数</span>
                <code>ROW_NUMBER()</code>
              </div>
              <div className="tiny-row">
                <span>CTE</span>
                <code>WITH cte AS</code>
              </div>
              <div className="tiny-row">
                <span>聚合</span>
                <code>GROUP BY</code>
              </div>
              <div className="tiny-row">
                <span>危险语句</span>
                <span className="danger-chip">DROP</span>
              </div>
            </div>
          </Panel>
        </aside>
      </section>
    </section>
  );
}
