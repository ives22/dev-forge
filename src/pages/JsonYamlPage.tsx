import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { bracketMatching, codeFolding, foldAll, foldedRanges, foldGutter, foldKeymap, forceParsing, HighlightStyle, syntaxHighlighting, unfoldAll } from "@codemirror/language";
import { closeSearchPanel, findNext, findPrevious, getSearchQuery, openSearchPanel, replaceAll, replaceNext, search, searchKeymap, SearchQuery, setSearchQuery } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { EditorSelection, EditorState } from "@codemirror/state";
import { drawSelection, dropCursor, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, runScopeHandlers } from "@codemirror/view";
import type { Panel as CodeMirrorPanel, ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { ChevronDown, ChevronLeft, ChevronRight, Copy, Replace, Search, X } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Button, Panel, SegmentButton } from "../components/Panel";
import { copyText } from "../lib/desktop";
import { usePageChrome } from "../hooks/usePageChrome";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import { formatJsonYaml, stripJsonComments, type DataFormat, type StructureTreeNode } from "../lib/tools/jsonYaml";

const samples: Record<DataFormat, string> = {
  json: '{\n  "name": "DevForge",\n  "tools": ["json", "yaml", "jwt"],\n  "local": true\n}',
  yaml: "name: DevForge\ntools:\n  - json\n  - yaml\n  - jwt\nlocal: true\n"
};

export interface JsonCodeEditorHandle {
  foldAll: () => void;
  unfoldAll: () => void;
  openSearch: () => void;
}

const jsonHighlightStyle = HighlightStyle.define([
  { tag: [tags.propertyName, tags.attributeName], color: "var(--accent-blue)" },
  { tag: [tags.string], color: "var(--accent-green)" },
  { tag: [tags.number], color: "var(--accent-orange)" },
  { tag: [tags.bool], color: "var(--accent-cyan)" },
  { tag: [tags.null], color: "var(--text-muted)" },
  { tag: [tags.brace, tags.squareBracket, tags.separator, tags.punctuation], color: "var(--text-secondary)" },
  { tag: [tags.keyword], color: "var(--accent-blue)" }
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    minHeight: "0",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: "12px"
  },
  ".cm-scroller": {
    height: "100%",
    overflow: "auto",
    fontFamily: "'JetBrains Mono', monospace"
  },
  ".cm-content": {
    minHeight: "100%",
    padding: "11px 13px",
    caretColor: "var(--text-primary)",
    lineHeight: "1.55",
    tabSize: "2"
  },
  ".cm-line": {
    padding: "0"
  },
  ".cm-gutters": {
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-muted)",
    borderRight: "1px solid var(--border-light)"
  },
  ".cm-activeLine": {
    backgroundColor: "var(--accent-blue-dim)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--accent-blue-dim)",
    color: "var(--text-primary)"
  },
  ".cm-foldPlaceholder": {
    border: "1px solid var(--border-light)",
    borderRadius: "4px",
    backgroundColor: "var(--bg-secondary)",
    color: "var(--text-muted)",
    padding: "0 6px"
  },
  ".cm-foldGutter span": {
    cursor: "pointer"
  },
  "&.cm-focused": {
    outline: "none"
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(59, 130, 246, .42)"
  },
  ".cm-searchMatch": {
    backgroundColor: "rgba(250, 204, 21, .28)",
    outline: "1px solid rgba(250, 204, 21, .34)"
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "rgba(34, 211, 238, .32)",
    outline: "1px solid rgba(34, 211, 238, .58)"
  }
});

function firstMatchSelection(view: EditorView, query: SearchQuery) {
  if (!query.valid || !query.search) return undefined;
  const cursor = query.getCursor(view.state);
  const first = cursor.next();
  return first.done ? undefined : EditorSelection.single(first.value.from, first.value.to);
}

function matchStats(view: EditorView, query: SearchQuery) {
  if (!query.valid || !query.search) return { current: 0, total: 0 };
  const selection = view.state.selection.main;
  let current = 0;
  let total = 0;
  const cursor = query.getCursor(view.state);
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    total += 1;
    if (next.value.from === selection.from && next.value.to === selection.to) current = total;
  }
  return { current: total > 0 ? current || 1 : 0, total };
}

function createJsonSearchPanel(view: EditorView): CodeMirrorPanel {
  const dom = document.createElement("div");
  dom.className = "json-search-panel";
  dom.addEventListener("keydown", (event) => {
    if (runScopeHandlers(view, event, "search-panel")) {
      event.preventDefault();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      runSearchCommand(event.shiftKey ? findPrevious : findNext);
    }
  });

  let reactRoot: Root | null = createRoot(dom);
  let query = getSearchQuery(view.state);
  let stats = matchStats(view, query);

  const createQuery = (overrides: Partial<{ search: string; replace: string }> = {}) =>
    new SearchQuery({
      search: overrides.search ?? query.search,
      replace: overrides.replace ?? query.replace,
      caseSensitive: false,
      literal: true,
      regexp: false,
      wholeWord: false
    });

  const commitSearch = (searchText: string) => {
    const nextQuery = new SearchQuery({
      search: searchText,
      replace: query.replace,
      caseSensitive: false,
      literal: true,
      regexp: false,
      wholeWord: false
    });
    query = nextQuery;
    const selection = firstMatchSelection(view, nextQuery);
    view.dispatch({
      effects: setSearchQuery.of(nextQuery),
      selection,
      scrollIntoView: Boolean(selection)
    });
    stats = matchStats(view, nextQuery);
    renderPanel();
  };

  const commitReplace = (replaceText: string) => {
    const nextQuery = createQuery({ replace: replaceText });
    query = nextQuery;
    view.dispatch({ effects: setSearchQuery.of(nextQuery) });
    stats = matchStats(view, nextQuery);
    renderPanel();
  };

  const runSearchCommand = (command: typeof findNext) => {
    command(view);
    query = getSearchQuery(view.state);
    stats = matchStats(view, query);
    renderPanel();
  };

  const runReplaceCommand = (command: typeof replaceNext) => {
    command(view);
    query = getSearchQuery(view.state);
    stats = matchStats(view, query);
    renderPanel();
  };

  const renderPanel = () => {
    reactRoot?.render(
      <div className="json-search-panel-inner">
        <div className="json-search-row">
          <label className="json-search-field">
            <Search size={14} aria-hidden="true" />
            <input
              aria-label="搜索 JSON/YAML 内容"
              autoComplete="off"
              main-field="true"
              placeholder="搜索当前内容"
              spellCheck={false}
              type="search"
              value={query.search}
              onChange={(event) => commitSearch(event.currentTarget.value)}
            />
          </label>
          <div className="json-search-controls">
            <span className="json-search-count" aria-live="polite">
              {stats.total ? `${stats.current}/${stats.total}` : query.search ? "0/0" : "-/-"}
            </span>
            <button className="json-search-icon-button" type="button" aria-label="上一处" title="上一处" onClick={() => runSearchCommand(findPrevious)}>
              <ChevronLeft size={15} />
            </button>
            <button className="json-search-icon-button" type="button" aria-label="下一处" title="下一处" onClick={() => runSearchCommand(findNext)}>
              <ChevronRight size={15} />
            </button>
            <button className="json-search-icon-button" type="button" aria-label="关闭搜索" title="关闭搜索" onClick={() => closeSearchPanel(view)}>
              <X size={15} />
            </button>
          </div>
        </div>
        <div className="json-search-row json-replace-row">
          <label className="json-search-field json-replace-field">
            <Replace size={14} aria-hidden="true" />
            <input
              aria-label="替换为"
              autoComplete="off"
              placeholder="替换为"
              spellCheck={false}
              type="text"
              value={query.replace}
              onChange={(event) => commitReplace(event.currentTarget.value)}
            />
          </label>
          <div className="json-search-controls json-replace-controls">
            <span className="json-search-count-spacer" aria-hidden="true" />
            <button className="json-search-action-button" type="button" onClick={() => runReplaceCommand(replaceNext)}>
              替换当前
            </button>
            <button className="json-search-action-button" type="button" onClick={() => runReplaceCommand(replaceAll)}>
              全部替换
            </button>
          </div>
        </div>
      </div>
    );
  };

  renderPanel();

  return {
    dom,
    update(update: ViewUpdate) {
      let shouldRender = update.docChanged || update.selectionSet;
      for (const transaction of update.transactions) {
        for (const effect of transaction.effects) {
          if (effect.is(setSearchQuery)) {
            query = effect.value;
            shouldRender = true;
          }
        }
      }
      if (shouldRender) {
        query = getSearchQuery(update.state);
        stats = matchStats(view, query);
        renderPanel();
      }
    },
    destroy() {
      reactRoot?.unmount();
      reactRoot = null;
    }
  };
}

function countVisibleLines(view: EditorView) {
  const totalLines = view.state.doc.lines;
  let hiddenLines = 0;
  foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
    const fromLine = view.state.doc.lineAt(from).number;
    const toLine = view.state.doc.lineAt(to).number;
    hiddenLines += Math.max(0, toLine - fromLine);
  });
  return Math.max(1, totalLines - hiddenLines);
}

function editorExtensions(format: DataFormat, onChange: (value: string) => void, onVisibleLineCountChange: (count: number) => void): Extension[] {
  return [
    lineNumbers(),
    foldGutter(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    dropCursor(),
    bracketMatching(),
    codeFolding(),
    highlightActiveLine(),
    syntaxHighlighting(jsonHighlightStyle),
    format === "json" ? json() : yaml(),
    search({ top: true, literal: true, caseSensitive: false, createPanel: createJsonSearchPanel }),
    keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap]),
    editorTheme,
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
      if (update.docChanged || update.viewportChanged || update.transactions.some((transaction) => transaction.effects.length > 0)) {
        onVisibleLineCountChange(countVisibleLines(update.view));
      }
    })
  ];
}

const JsonCodeEditor = forwardRef<
  JsonCodeEditorHandle,
  {
    value: string;
    format: DataFormat;
    onChange: (value: string) => void;
    onVisibleLineCountChange: (count: number) => void;
  }
>(function JsonCodeEditor(
  {
    value,
    format,
    onChange,
    onVisibleLineCountChange
  },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onVisibleLineCountChangeRef = useRef(onVisibleLineCountChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onVisibleLineCountChangeRef.current = onVisibleLineCountChange;
  }, [onVisibleLineCountChange]);

  useImperativeHandle(ref, () => ({
    foldAll: () => {
      const view = viewRef.current;
      if (!view) return;
      forceParsing(view, view.state.doc.length);
      foldAll(view);
      onVisibleLineCountChangeRef.current(countVisibleLines(view));
    },
    unfoldAll: () => {
      const view = viewRef.current;
      if (!view) return;
      unfoldAll(view);
      onVisibleLineCountChangeRef.current(countVisibleLines(view));
    },
    openSearch: () => {
      const view = viewRef.current;
      if (!view) return;
      openSearchPanel(view);
    }
  }));

  useEffect(() => {
    if (!hostRef.current) return undefined;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: editorExtensions(
          format,
          (nextValue) => onChangeRef.current(nextValue),
          (count) => onVisibleLineCountChangeRef.current(count)
        )
      })
    });
    view.contentDOM.setAttribute("aria-label", `${format.toUpperCase()} 编辑器`);
    view.contentDOM.setAttribute("role", "textbox");
    view.contentDOM.setAttribute("aria-multiline", "true");
    viewRef.current = view;
    onVisibleLineCountChangeRef.current(countVisibleLines(view));

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [format]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (currentValue === value) {
      onVisibleLineCountChangeRef.current(countVisibleLines(view));
      return;
    }
    const anchor = Math.min(view.state.selection.main.anchor, value.length);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: EditorSelection.cursor(anchor)
    });
    onVisibleLineCountChangeRef.current(countVisibleLines(view));
  }, [value]);

  return <div ref={hostRef} className="json-code-editor" />;
});

function defaultExpandedIds(node?: StructureTreeNode) {
  if (!node) return new Set<string>();
  const ids = new Set<string>([node.id]);
  node.children.forEach((child) => {
    if (child.children.length > 0) ids.add(child.id);
  });
  return ids;
}

function StructureTree({ tree }: { tree: StructureTreeNode }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => defaultExpandedIds(tree));

  useEffect(() => {
    setExpandedIds(defaultExpandedIds(tree));
  }, [tree]);

  const toggle = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="json-structure-tree" role="tree" aria-label="JSON 结构树">
      <StructureTreeItem node={tree} depth={0} expandedIds={expandedIds} onToggle={toggle} />
    </div>
  );
}

function StructureTreeItem({
  node,
  depth,
  expandedIds,
  onToggle
}: {
  node: StructureTreeNode;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const expandable = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  return (
    <div className="json-tree-item" role="treeitem" aria-expanded={expandable ? expanded : undefined}>
      <div className="json-tree-row" style={{ "--tree-depth": depth } as CSSProperties}>
        {expandable ? (
          <button className="json-tree-toggle" type="button" aria-label={`${expanded ? "折叠" : "展开"} ${node.label}`} onClick={() => onToggle(node.id)}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="json-tree-toggle-spacer" aria-hidden="true" />
        )}
        <span className="json-tree-label">{node.label}</span>
        <span className={`json-tree-type json-tree-type-${node.type.toLowerCase()}`}>{node.type}</span>
        <span className="json-tree-summary">{node.summary}</span>
        {node.valuePreview ? <code className="json-tree-value">{node.valuePreview}</code> : null}
      </div>
      {expandable && expanded ? (
        <div role="group">
          {node.children.map((child) => (
            <StructureTreeItem key={child.id} node={child} depth={depth + 1} expandedIds={expandedIds} onToggle={onToggle} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function JsonYamlPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [format, setFormat] = useState<DataFormat>("json");
  const [compact, setCompact] = useState(false);
  const [indent, setIndent] = useState<2 | 4>(2);
  const [inputs, setInputs] = useState<Record<DataFormat, string>>(() => ({ ...samples }));
  const input = inputs[format];
  const [visibleLineCount, setVisibleLineCount] = useState(() => samples.json.split("\n").length);
  const editorRef = useRef<JsonCodeEditorHandle>(null);
  const result = useMemo(() => formatJsonYaml(input, { format, compact, indent }), [compact, format, indent, input]);
  const metrics = [
    { label: "字段", value: result.stats.keys },
    { label: "大小", value: result.size },
    { label: "状态", value: result.ok ? "Valid" : "Error", compact: true }
  ];
  usePageChrome({
    tool: toolById["json-yaml"],
    metrics
  });

  const setInput = (nextInput: string) => {
    setInputs((current) => ({ ...current, [format]: nextInput }));
  };

  const applyTransform = (nextOptions?: Partial<{ format: DataFormat; compact: boolean; indent: 2 | 4 }>) => {
    const options = { format, compact, indent, ...nextOptions };
    const nextResult = formatJsonYaml(input, options);
    if (nextResult.ok) {
      setInput(nextResult.output);
    }
    return nextResult;
  };

  const setMode = (nextCompact: boolean) => {
    setCompact(nextCompact);
    applyTransform({ compact: nextCompact });
  };

  const setIndentSize = (nextIndent: 2 | 4) => {
    setIndent(nextIndent);
    applyTransform({ indent: nextIndent });
  };

  const persist = async (action: string) => {
    await recordUsage({ toolId: "json-yaml", action, input, output: result.output, status: result.ok ? "ok" : "error" });
  };

  const runTransform = async () => {
    const nextResult = applyTransform();
    await recordUsage({
      toolId: "json-yaml",
      action: compact ? "minify" : "format",
      input,
      output: nextResult.output,
      status: nextResult.ok ? "ok" : "error"
    });
  };

  return (
    <section className="tool-shell">
      <div className="mode-strip">
        <div className="segmented-control">
          <SegmentButton active={format === "json"} onClick={() => setFormat("json")}>
            JSON
          </SegmentButton>
          <SegmentButton active={format === "yaml"} onClick={() => setFormat("yaml")}>
            YAML
          </SegmentButton>
        </div>
        <div className="segmented-control">
          <SegmentButton active={!compact} onClick={() => setMode(false)}>
            格式化
          </SegmentButton>
          <SegmentButton active={compact} onClick={() => setMode(true)}>
            压缩
          </SegmentButton>
        </div>
        <div className="segmented-control">
          <SegmentButton active={indent === 2} onClick={() => setIndentSize(2)}>
            2
          </SegmentButton>
          <SegmentButton active={indent === 4} onClick={() => setIndentSize(4)}>
            4
          </SegmentButton>
        </div>
        <div className="mode-tools">
          <Button onClick={() => setInput(samples[format])}>示例</Button>
          <Button onClick={() => setInput("")}>清空</Button>
          <Button variant="primary" onClick={() => void runTransform()}>
            运行
          </Button>
        </div>
      </div>
      <div className="single-workbench">
        <div className="single-main">
          <Panel
            className="editor-panel json-editor-panel"
            title={format.toUpperCase()}
            actions={
              <>
                {format === "json" ? <Button onClick={() => setInput(stripJsonComments(input))}>去注释</Button> : null}
                <Button onClick={() => editorRef.current?.openSearch()}>
                  <Search size={14} /> 搜索
                </Button>
                <Button onClick={() => editorRef.current?.foldAll()}>折叠</Button>
                <Button onClick={() => editorRef.current?.unfoldAll()}>展开</Button>
                <Button onClick={() => void copyText(result.output).then(() => persist("copy"))}>
                  <Copy size={14} /> 复制
                </Button>
              </>
            }
          >
            <div className="editor-body unified-editor">
              <JsonCodeEditor ref={editorRef} value={input} format={format} onChange={setInput} onVisibleLineCountChange={setVisibleLineCount} />
            </div>
            <div className="editor-footer">
              <span className={result.ok ? "json-visible-lines" : "error-text"}>
                {result.ok ? `${visibleLineCount} 行 · ${input.length} chars · ${format.toUpperCase()}` : result.error}
              </span>
              <span>{result.ok ? "Parsed" : "Error"}</span>
            </div>
          </Panel>
        </div>
        <aside className="side-stack">
          <Panel className="inspector-panel json-tree-panel" title="结构预览">
            {result.ok && result.tree ? (
              <StructureTree tree={result.tree} />
            ) : (
              <div className="error-text json-tree-error">{result.error}</div>
            )}
          </Panel>
          <Panel className="inspector-panel" title="检查项">
            <div className="tiny-list">
              <div className="tiny-row">
                <span>根类型</span>
                <code>{result.stats.rootType}</code>
              </div>
              <div className="tiny-row">
                <span>数组</span>
                <code>{result.stats.arrays}</code>
              </div>
              <div className="tiny-row">
                <span>层级</span>
                <code>{result.stats.depth}</code>
              </div>
            </div>
          </Panel>
        </aside>
      </div>
    </section>
  );
}
