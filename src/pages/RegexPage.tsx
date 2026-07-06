import { Copy, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, EditorPanel, Panel, SegmentButton } from "../components/Panel";
import { copyText, evaluateRegexNative } from "../lib/desktop";
import { usePageChrome } from "../hooks/usePageChrome";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import {
  defaultRegexFlags,
  evaluateRegex,
  regexMatchesToText,
  type RegexFlag,
  type RegexHighlightPart,
  type RegexMode
} from "../lib/tools/regex";

const samplePattern = String.raw`(?<name>[\w.-]+)@(?<domain>[\w.-]+\.[A-Za-z]{2,})`;
const sampleText = "Contact devforge@app.local, api-team@example.com and ops@example.org for rollout notes.";
const replaceSamplePattern = String.raw`(?<method>GET|POST|PUT|DELETE)\s+(?<path>/[\w/-]+)\s+(?<status>\d{3})`;
const replaceSampleText = "GET /api/users 200\nPOST /api/session 201\nDELETE /api/session 204";

const flagOptions: Array<{ flag: RegexFlag; title: string }> = [
  { flag: "g", title: "全局" },
  { flag: "i", title: "忽略大小写" },
  { flag: "m", title: "多行" },
  { flag: "s", title: "点号匹配换行" },
  { flag: "u", title: "Unicode" },
  { flag: "x", title: "扩展模式" }
];
const matchToneCount = 8;

function ToggleFlagButton({
  active,
  flag,
  title,
  onToggle
}: {
  active: boolean;
  flag: RegexFlag;
  title: string;
  onToggle: (flag: RegexFlag) => void;
}) {
  return (
    <button className={`segment-btn regex-flag-btn ${active ? "active" : ""}`} type="button" aria-pressed={active} title={title} onClick={() => onToggle(flag)}>
      {flag}
    </button>
  );
}

function HighlightPreview({ parts, error }: { parts: RegexHighlightPart[]; error?: string }) {
  if (error) {
    return <div className="regex-preview-error">{error}</div>;
  }

  if (!parts.length) {
    return <div className="regex-preview-empty">输入测试文本后会显示匹配高亮。</div>;
  }

  return (
    <>
      {parts.map((part, index) =>
        part.match ? (
          <mark className={`regex-match-hit tone-${(part.matchIndex ?? 0) % matchToneCount}`} key={`${index}-${part.matchIndex}`} title={`匹配 #${(part.matchIndex ?? 0) + 1}`}>
            {part.text}
          </mark>
        ) : (
          <span key={`${index}-${part.text.slice(0, 8)}`}>{part.text}</span>
        )
      )}
    </>
  );
}

export function RegexPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [mode, setMode] = useState<RegexMode>("test");
  const [pattern, setPattern] = useState(samplePattern);
  const [text, setText] = useState(sampleText);
  const [flags, setFlags] = useState<RegexFlag[]>(defaultRegexFlags);
  const [replacement, setReplacement] = useState("[$<name>] at $<domain>");
  const [copyLabel, setCopyLabel] = useState("复制");
  const [result, setResult] = useState(() => evaluateRegex({ pattern: samplePattern, flags: defaultRegexFlags, text: sampleText, replacement: "[$<name>] at $<domain>" }));
  const evaluationSeqRef = useRef(0);

  useEffect(() => {
    const seq = ++evaluationSeqRef.current;
    void evaluateRegexNative({ pattern, flags, text, replacement })
      .then((nextResult) => {
        if (evaluationSeqRef.current === seq) setResult(nextResult);
      })
      .catch((error) => {
        if (evaluationSeqRef.current !== seq) return;
        const message = error instanceof Error ? error.message : "后端正则引擎不可用";
        setResult({
          ok: false,
          flags: flags.join(""),
          expression: `/${pattern}/${flags.join("")}`,
          matches: [],
          highlights: [{ text: message, match: false }],
          groupCount: 0,
          replaceOutput: "",
          state: "Error",
          error: message,
          engine: "Native"
        });
      });
  }, [flags, pattern, replacement, text]);

  const metrics = [
    { label: "匹配", value: result.matches.length },
    { label: "分组", value: result.groupCount },
    { label: "状态", value: result.state, compact: true }
  ];
  const visibleGroups = result.matches.slice(0, 8);
  const expressionLabel = result.expression.length > 54 ? `${result.expression.slice(0, 51)}...` : result.expression;

  usePageChrome({
    tool: toolById.regex,
    kicker: "表达式、Flags、捕获分组与替换预览",
    metrics
  });

  const toggleFlag = (flag: RegexFlag) => {
    setFlags((current) => (current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag]));
  };

  const loadSample = () => {
    if (mode === "replace") {
      setPattern(replaceSamplePattern);
      setText(replaceSampleText);
      setReplacement("$<method> $<path> -> HTTP $<status>");
      setFlags(["g"]);
      return;
    }

    setPattern(samplePattern);
    setText(sampleText);
    setReplacement("[$<name>] at $<domain>");
    setFlags(["g", "i"]);
  };

  const clear = () => {
    setText("");
  };

  const persist = async (action: string, output: string) => {
    await recordUsage({
      toolId: "regex",
      action,
      input: `${result.expression}\n${text}`,
      output,
      status: result.ok ? "ok" : "error"
    });
  };

  const copyResult = async () => {
    const output = mode === "replace" ? result.replaceOutput : regexMatchesToText(result.matches);
    await copyText(output);
    setCopyLabel("已复制");
    window.setTimeout(() => setCopyLabel("复制"), 900);
    await persist("copy", output);
  };

  const run = async () => {
    await persist(mode === "replace" ? "replace" : "test", mode === "replace" ? result.replaceOutput : regexMatchesToText(result.matches));
  };

  return (
    <section className="tool-shell" aria-label="正则测试工具">
      <section className="mode-strip" aria-label="正则操作">
        <div className="segmented-control regex-mode-control" role="tablist" aria-label="正则模式">
          <SegmentButton active={mode === "test"} onClick={() => setMode("test")}>
            正则测试
          </SegmentButton>
          <SegmentButton active={mode === "replace"} onClick={() => setMode("replace")}>
            替换预览
          </SegmentButton>
        </div>
        <div className="segmented-control regex-flag-control" aria-label="正则 flags">
          {flagOptions.map((item) => (
            <ToggleFlagButton key={item.flag} active={flags.includes(item.flag)} flag={item.flag} title={item.title} onToggle={toggleFlag} />
          ))}
        </div>
        <div className="mode-tools">
          <Button onClick={loadSample}>示例</Button>
          <Button onClick={clear}>清空</Button>
          <Button onClick={() => void copyResult()}>
            <Copy size={14} /> {copyLabel}
          </Button>
          <Button variant="primary" onClick={() => void run()}>
            运行
          </Button>
        </div>
      </section>

      <section className="regex-workbench">
        <div className="single-main regex-main">
          <section className="panel regex-pattern-panel">
            <div className="panel-topbar">
              <div className="panel-title">正则表达式</div>
              <div className="panel-actions">
                <span className={`health-badge ${result.ok ? "" : "error"}`}>{result.state}</span>
              </div>
            </div>
            <label className="port-search regex-pattern-field">
              <Search size={15} aria-hidden="true" />
              <input value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="输入正则表达式" spellCheck={false} />
            </label>
          </section>

          <EditorPanel
            title="测试文本"
            actions={<span className="format-badge">{text.length} chars</span>}
            value={text}
            onChange={setText}
            footerLeft={result.ok ? expressionLabel : result.error}
            footerRight={result.engine}
            className="regex-text-panel"
            textareaClassName="medium"
            showLineNumbers={false}
          />

          {mode === "replace" ? (
            <div className="regex-output-grid">
              <EditorPanel
                title="替换模板"
                value={replacement}
                onChange={setReplacement}
                footerLeft="$1 / $<name> 可用"
                footerRight="Replacement"
                className="regex-replacement-panel"
                showLineNumbers={false}
              />
              <EditorPanel
                title="替换结果"
                actions={
                  <Button onClick={() => void copyText(result.replaceOutput).then(() => persist("copy-replace", result.replaceOutput))}>
                    <Copy size={14} /> 复制
                  </Button>
                }
                value={result.ok ? result.replaceOutput : result.error ?? ""}
                readOnly
                footerLeft={result.ok ? `${result.matches.length} 处替换` : "Error"}
                footerRight={result.engine}
                className="regex-replacement-panel"
                showLineNumbers={false}
              />
            </div>
          ) : (
            <section className="editor-panel regex-preview-panel">
              <div className="panel-topbar">
                <div className="panel-title">匹配高亮</div>
                <div className="panel-actions">
                  <span className={`health-badge ${result.ok ? "" : "error"}`}>{result.state}</span>
                </div>
              </div>
              <div className="regex-code-output">
                <HighlightPreview parts={result.highlights} error={result.error} />
              </div>
              <div className="editor-footer">
                <span>{result.matches.length ? `首个匹配 @ ${result.matches[0].index}` : "No Match"}</span>
                <span>{result.engine}</span>
              </div>
            </section>
          )}
        </div>

        <aside className="side-stack regex-side-stack">
          <section className="inspector-panel regex-groups-panel">
            <div className="inspector-heading">
              <div className="inspector-title">捕获分组</div>
              <span className={`health-badge ${result.ok ? "" : "error"}`}>{result.state}</span>
            </div>
            <div className="proto-list">
              {visibleGroups.length ? (
                visibleGroups.map((match, index) => (
                  <div className="regex-group-card" key={`${match.index}-${match.text}-${index}`}>
                    <div className="regex-group-card-top">
                      <span>#{index + 1}</span>
                      <code>
                        {match.index}-{match.end}
                      </code>
                    </div>
                    <strong>{match.text || "(empty)"}</strong>
                    <div className="regex-group-list">
                      {match.groups.length ? (
                        match.groups.map((group) => (
                          <div className="proto-list-row" key={`${match.index}-${group.type}-${group.label}`}>
                            <span className="proto-name">{group.label}</span>
                            <span className="proto-value">{group.value || "-"}</span>
                          </div>
                        ))
                      ) : (
                        <div className="proto-list-row">
                          <span className="proto-name">无捕获组</span>
                          <span className="proto-value">-</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="proto-list-row">
                  <span className="proto-name">{result.ok ? "无匹配" : "表达式错误"}</span>
                  <span className="proto-value">{result.ok ? "0" : "Error"}</span>
                </div>
              )}
            </div>
          </section>

          <Panel title="Flags" className="regex-flags-panel">
            <div className="tiny-list">
              {flagOptions.map((item) => (
                <div className="tiny-row" key={item.flag}>
                  <span>{item.title}</span>
                  <code>{flags.includes(item.flag) ? item.flag : "-"}</code>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="速查" className="regex-cheatsheet-panel">
            <div className="tiny-list">
              <div className="tiny-row">
                <span>命名分组</span>
                <code>{"(?<name>...)"}</code>
              </div>
              <div className="tiny-row">
                <span>单词字符</span>
                <code>\w+</code>
              </div>
              <div className="tiny-row">
                <span>非贪婪</span>
                <code>.*?</code>
              </div>
              <div className="tiny-row">
                <span>替换引用</span>
                <code>$1 / $&lt;name&gt;</code>
              </div>
            </div>
          </Panel>
        </aside>
      </section>
    </section>
  );
}
