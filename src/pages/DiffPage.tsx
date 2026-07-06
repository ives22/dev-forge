import { forwardRef, useMemo, useRef, useState } from "react";
import type { CSSProperties, UIEvent } from "react";
import { Button, SegmentButton, SwitchToggle } from "../components/Panel";
import { usePageChrome } from "../hooks/usePageChrome";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import { compareDiff, splitLines, type DiffMode, type DiffOp } from "../lib/tools/diff";

const samples: Record<DiffMode, { left: string; right: string }> = {
  text: {
    left: "server:\n  host: devforge.local\n  port: 8080\nfeatures:\n  diff: false\n  theme: dark\ncache: enabled",
    right: "server:\n  host: devforge.local\n  port: 9090\nfeatures:\n  diff: true\n  theme: light\ncache: enabled\ntelemetry: local-only"
  },
  json: {
    left: '{\n  "name": "DevForge",\n  "version": "2.4.1",\n  "theme": "dark",\n  "tools": ["json", "base64", "url"]\n}',
    right: '{\n  "name": "DevForge",\n  "version": "2.5.0",\n  "theme": "light",\n  "native": true,\n  "tools": ["json", "base64", "url", "diff"]\n}'
  }
};

function cellClass(type: DiffOp["type"]) {
  if (type === "add") return "is-add";
  if (type === "remove") return "is-remove";
  if (type.startsWith("change")) return "is-change";
  return "";
}

function markFor(type: DiffOp["type"], side: "left" | "right") {
  if (type === "add") return side === "right" ? "+" : "";
  if (type === "remove") return side === "left" ? "-" : "";
  if (type === "change-add") return side === "right" ? "~" : "";
  if (type === "change-remove") return side === "left" ? "~" : "";
  return "";
}

function textFor(op: DiffOp, side: "left" | "right") {
  return side === "left" ? op.left : op.right;
}

function lineNoFor(op: DiffOp, side: "left" | "right") {
  return side === "left" ? op.leftNo : op.rightNo;
}

function measureDiffWidth(ops: DiffOp[]) {
  const maxText = ops.reduce((max, op) => Math.max(max, String(op.left ?? "").length, String(op.right ?? "").length), 0);
  const contentWidth = Math.ceil(maxText * 7.25 + 86);
  return contentWidth <= 640 ? "100%" : `${Math.min(2600, contentWidth)}px`;
}

function DiffRender({ rows, ops, side, error }: { rows: DiffOp[]; ops: DiffOp[]; side: "left" | "right"; error?: string }) {
  const lineWidth = error || !ops.length ? "100%" : measureDiffWidth(ops);

  if (error) {
    return (
      <div className="diff-render" style={{ "--diff-line-width": lineWidth } as CSSProperties} aria-hidden="true">
        <div className="diff-error">{error}</div>
      </div>
    );
  }

  if (!ops.length) {
    return (
      <div className="diff-render" style={{ "--diff-line-width": lineWidth } as CSSProperties} aria-hidden="true">
        <div className="diff-empty">输入内容后会在这里直接显示差异。</div>
      </div>
    );
  }

  return (
    <div className="diff-render" style={{ "--diff-line-width": lineWidth } as CSSProperties} aria-hidden="true">
      <div className="diff-render-inner">
        {rows.map((op, index) => {
          if (op.type === "fold") {
            return (
              <div className="is-folded-same" key={`fold-${index}`}>
                <span>...</span>
                <span>已折叠 {op.count} 行相同内容</span>
              </div>
            );
          }

          const text = textFor(op, side);
          const hasText = text != null;
          return (
            <div className={`diff-cell ${cellClass(op.type)}${hasText ? "" : " is-empty"}`} key={`${side}-${index}`}>
              <span className="diff-no">{lineNoFor(op, side) ?? ""}</span>
              <span className="diff-mark">{markFor(op.type, side)}</span>
              <span className="diff-code">{hasText ? text : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DiffEditorProps {
  side: "left" | "right";
  title: string;
  value: string;
  preparedValue: string;
  rows: DiffOp[];
  ops: DiffOp[];
  error?: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onChange: (value: string) => void;
  onScroll: (event: UIEvent<HTMLTextAreaElement>, side: "left" | "right") => void;
}

const DiffEditor = forwardRef<HTMLTextAreaElement, DiffEditorProps>(function DiffEditor({
  side,
  title,
  value,
  preparedValue,
  rows,
  ops,
  error,
  editing,
  onEditingChange,
  onChange,
  onScroll
}, ref) {
  return (
    <section className={`editor-panel diff-editor-panel ${editing ? "is-editing" : ""}`}>
      <div className="panel-topbar">
        <div className="panel-title">{title}</div>
        <div className="panel-actions">
          <span className="format-badge">{splitLines(preparedValue).length} 行</span>
        </div>
      </div>
      <div className="editor-body diff-editor-body">
        <DiffRender rows={rows} ops={ops} side={side} error={error} />
        <textarea
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => onEditingChange(true)}
          onBlur={() => onEditingChange(false)}
          onScroll={(event) => onScroll(event, side)}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>
      <div className="editor-footer">
        <span>{side === "left" ? "Original" : "Changed"}</span>
        <span>UTF-8</span>
      </div>
    </section>
  );
});

export function DiffPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [mode, setMode] = useState<DiffMode>("text");
  const [left, setLeft] = useState(samples.text.left);
  const [right, setRight] = useState(samples.text.right);
  const [ignoreSpace, setIgnoreSpace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [foldSame, setFoldSame] = useState(false);
  const [sortJson, setSortJson] = useState(true);
  const [editing, setEditing] = useState<"left" | "right" | null>(null);
  const leftRef = useRef<HTMLTextAreaElement | null>(null);
  const rightRef = useRef<HTMLTextAreaElement | null>(null);

  const result = useMemo(
    () => compareDiff(left, right, { mode, ignoreSpace, ignoreCase, foldSame, sortJson }),
    [foldSame, ignoreCase, ignoreSpace, left, mode, right, sortJson]
  );
  const metrics = [
    { label: "新增", value: result.stats.added },
    { label: "删除", value: result.stats.removed },
    { label: "变更", value: result.stats.changed, compact: true }
  ];
  usePageChrome({
    tool: toolById.diff,
    metrics
  });

  const setCompareMode = (nextMode: DiffMode, loadSample = true) => {
    setMode(nextMode);
    setEditing(null);
    if (loadSample) {
      setLeft(samples[nextMode].left);
      setRight(samples[nextMode].right);
    }
  };

  const runCompare = async () => {
    setEditing(null);
    await recordUsage({
      toolId: "diff",
      action: "compare",
      input: `${left}\n---\n${right}`,
      output: result.plain,
      status: result.ok ? "ok" : "error"
    });
  };

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>, source: "left" | "right") => {
    const own = event.currentTarget;
    const peer = source === "left" ? rightRef.current : leftRef.current;
    const syncRender = (textarea: HTMLTextAreaElement) => {
      const render = textarea.previousElementSibling;
      if (!(render instanceof HTMLElement)) return;
      render.scrollTop = textarea.scrollTop;
      render.scrollLeft = textarea.scrollLeft;
    };
    syncRender(own);
    if (!peer) return;
    peer.scrollTop = own.scrollTop;
    peer.scrollLeft = own.scrollLeft;
    syncRender(peer);
  };

  const swap = () => {
    setLeft(right);
    setRight(left);
    setEditing(null);
  };

  const clear = () => {
    setLeft("");
    setRight("");
    setEditing("left");
    window.setTimeout(() => leftRef.current?.focus(), 0);
  };

  return (
    <section className="tool-shell" aria-label="差异对比工具">
      <section className="mode-strip">
        <div className="segmented-control" role="tablist" aria-label="差异内容类型">
          <SegmentButton active={mode === "text"} onClick={() => setCompareMode("text")}>
            文本
          </SegmentButton>
          <SegmentButton active={mode === "json"} onClick={() => setCompareMode("json")}>
            JSON
          </SegmentButton>
        </div>
        <div className="mode-tools">
          <Button onClick={() => setCompareMode(mode, true)}>示例</Button>
          <Button onClick={swap}>交换</Button>
          <Button onClick={clear}>清空</Button>
          <Button variant="primary" onClick={() => void runCompare()}>
            对比
          </Button>
        </div>
      </section>

      <section className="diff-workbench">
        <div className="diff-main">
          <section className="diff-editors" aria-label="左右输入">
            <DiffEditor
              ref={leftRef}
              side="left"
              title="左侧内容"
              value={left}
              preparedValue={result.leftPrepared}
              rows={result.rows}
              ops={result.ops}
              error={result.error}
              editing={editing === "left"}
              onEditingChange={(value) => setEditing(value ? "left" : null)}
              onChange={setLeft}
              onScroll={syncScroll}
            />
            <DiffEditor
              ref={rightRef}
              side="right"
              title="右侧内容"
              value={right}
              preparedValue={result.rightPrepared}
              rows={result.rows}
              ops={result.ops}
              error={result.error}
              editing={editing === "right"}
              onEditingChange={(value) => setEditing(value ? "right" : null)}
              onChange={setRight}
              onScroll={syncScroll}
            />
          </section>
        </div>

        <aside className="side-stack" aria-label="差异设置">
          <section className="inspector-panel">
            <div className="inspector-heading">
              <div className="inspector-title">差异统计</div>
              <span className={`health-badge ${result.ok ? (result.stats.blocks ? "warning" : "") : "error"}`}>
                {result.ok ? (result.stats.blocks ? "Diff" : "Same") : "Error"}
              </span>
            </div>
            <div className="diff-stat-grid">
              <div className="diff-stat">
                <div className="diff-stat-label">相同</div>
                <div className="diff-stat-value">{result.stats.same}</div>
              </div>
              <div className="diff-stat">
                <div className="diff-stat-label">变更块</div>
                <div className="diff-stat-value">{result.stats.blocks}</div>
              </div>
              <div className="diff-stat">
                <div className="diff-stat-label">左侧行</div>
                <div className="diff-stat-value">{result.stats.leftLines}</div>
              </div>
              <div className="diff-stat">
                <div className="diff-stat-label">右侧行</div>
                <div className="diff-stat-value">{result.stats.rightLines}</div>
              </div>
            </div>
          </section>

          <section className="inspector-panel">
            <div className="inspector-heading">
              <div className="inspector-title">对比选项</div>
            </div>
            <div className="analysis-list">
              <SwitchToggle checked={ignoreSpace} onChange={setIgnoreSpace} title="忽略空白" hint="比较时压缩连续空白" />
              <SwitchToggle checked={ignoreCase} onChange={setIgnoreCase} title="忽略大小写" hint="适合日志和配置项" />
              <SwitchToggle checked={foldSame} onChange={setFoldSame} title="折叠相同" hint="隐藏连续未变化行" />
              {mode === "json" ? <SwitchToggle checked={sortJson} onChange={setSortJson} title="JSON key 排序" hint="JSON 模式下稳定字段顺序" /> : null}
            </div>
          </section>

          <section className="inspector-panel">
            <div className="inspector-heading">
              <div className="inspector-title">读取方式</div>
            </div>
            <div className="diff-hint">文本模式按行比较。JSON 模式会先解析、格式化，再进入差异算法，便于查看接口响应或配置文件变化。</div>
          </section>
        </aside>
      </section>
    </section>
  );
}
