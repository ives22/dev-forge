import { Copy, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Field, Panel, SegmentButton, SwitchToggle } from "../components/Panel";
import { copyText } from "../lib/desktop";
import { usePageChrome } from "../hooks/usePageChrome";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import {
  clampGeneratorNumber,
  defaultPasswordOptions,
  generateCredentials,
  type GenerateResult,
  type GeneratedCredential,
  type GeneratorMode
} from "../lib/tools/password";

const modeLabels: Record<GeneratorMode, string> = {
  password: "密码",
  uuid: "UUID v4",
  nanoid: "NanoID"
};

function initialResult(): GenerateResult {
  return generateCredentials({ ...defaultPasswordOptions, mode: "password" });
}

function qualityClass(kind: string) {
  if (kind === "medium") return "medium";
  if (kind === "weak") return "weak";
  return "strong";
}

export function PasswordPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const initialGenerated = useMemo(() => initialResult(), []);
  const [mode, setMode] = useState<GeneratorMode>("password");
  const [countInput, setCountInput] = useState(String(defaultPasswordOptions.count));
  const [length, setLength] = useState(defaultPasswordOptions.length);
  const [lower, setLower] = useState(defaultPasswordOptions.lower);
  const [upper, setUpper] = useState(defaultPasswordOptions.upper);
  const [numbers, setNumbers] = useState(defaultPasswordOptions.numbers);
  const [symbols, setSymbols] = useState(defaultPasswordOptions.symbols);
  const [exclude, setExclude] = useState(defaultPasswordOptions.exclude);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [result, setResult] = useState<GenerateResult>(() => initialGenerated);
  const [rows, setRows] = useState<GeneratedCredential[]>(() => (initialGenerated.ok ? initialGenerated.values : []));
  const [copyAllLabel, setCopyAllLabel] = useState("复制全部");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const count = countInput === "" ? rows.length || defaultPasswordOptions.count : clampGeneratorNumber(Number(countInput), 1, 100, defaultPasswordOptions.count);
  const modeLength = mode === "uuid" ? 36 : length;

  useEffect(() => {
    if (countInput === "") return;

    const generated = generateCredentials({
      mode,
      count,
      length: modeLength,
      lower,
      upper,
      numbers,
      symbols,
      exclude
    });

    setResult(generated);
    if (generated.ok) {
      setRows(generated.values);
      if (mode !== "uuid" && generated.length !== length) setLength(generated.length);
    }
  }, [count, countInput, exclude, length, lower, mode, modeLength, numbers, refreshSeed, symbols, upper]);

  const metrics = useMemo(
    () => [
      { label: "数量", value: result.count },
      { label: "模式", value: modeLabels[mode] },
      { label: "长度", value: result.ok && rows[0] ? rows[0].length : result.length }
    ],
    [mode, result.count, result.length, result.ok, rows]
  );
  usePageChrome({
    tool: toolById.password,
    kicker: "密码、UUID v4 与 NanoID 生成",
    metrics
  });

  const healthKind = result.ok ? "" : "error";
  const healthText = result.ok ? "Ready" : result.message;
  const poolText = result.poolSize ? `${result.poolSize} chars` : "0 chars";
  const statusText = result.ok ? `${modeLabels[mode]} · ${result.quality.text}` : `${modeLabels[mode]} · ${result.message}`;

  const switchMode = (nextMode: GeneratorMode) => {
    setMode(nextMode);
    setLength(nextMode === "uuid" ? 36 : nextMode === "nanoid" ? 21 : 24);
  };

  const commitCount = () => {
    setCountInput(String(countInput === "" ? defaultPasswordOptions.count : clampGeneratorNumber(Number(countInput), 1, 100, defaultPasswordOptions.count)));
  };

  const updateLength = (value: number) => {
    const min = mode === "uuid" ? 36 : 4;
    const max = mode === "uuid" ? 36 : 128;
    setLength(clampGeneratorNumber(value, min, max, mode === "nanoid" ? 21 : 24));
  };

  const copyAll = async () => {
    setCopyAllLabel("已复制");
    window.setTimeout(() => setCopyAllLabel("复制全部"), 900);
    let status: UsageDraft["status"] = "ok";
    try {
      await copyText(rows.map((row) => row.value).join("\n"));
    } catch {
      status = "warn";
    }
    await recordUsage({
      toolId: "password",
      action: "copy-all",
      input: `${rows.length} ${modeLabels[mode]}`,
      output: `${rows.length} values copied`,
      status: rows.length ? status : "warn"
    });
  };

  const copyOne = async (row: GeneratedCredential, index: number) => {
    setCopiedIndex(index);
    window.setTimeout(() => setCopiedIndex(null), 900);
    let status: UsageDraft["status"] = "ok";
    try {
      await copyText(row.value);
    } catch {
      status = "warn";
    }
    await recordUsage({ toolId: "password", action: "copy", input: modeLabels[mode], output: `${row.length} chars copied`, status });
  };

  return (
    <section className="tool-shell password-tool-shell" aria-label="密码生成器">
      <section className="mode-strip password-mode-strip" aria-label="生成模式">
        <div className="segmented-control password-mode-control" role="tablist" aria-label="生成模式">
          <SegmentButton active={mode === "password"} onClick={() => switchMode("password")} role="tab" aria-selected={mode === "password"}>
            密码
          </SegmentButton>
          <SegmentButton active={mode === "uuid"} onClick={() => switchMode("uuid")} role="tab" aria-selected={mode === "uuid"}>
            UUID v4
          </SegmentButton>
          <SegmentButton active={mode === "nanoid"} onClick={() => switchMode("nanoid")} role="tab" aria-selected={mode === "nanoid"}>
            NanoID
          </SegmentButton>
        </div>
        <div className="mode-tools">
          <span className="format-badge">数量 {rows.length}</span>
          <span className="format-badge">模式 {modeLabels[mode]}</span>
          <span className="format-badge">长度 {rows[0]?.length ?? result.length}</span>
          <Button onClick={() => setRefreshSeed((seed) => seed + 1)}>
            <RefreshCw size={14} /> 重新生成
          </Button>
          <Button className="password-copy-all" variant="primary" onClick={() => void copyAll()}>
            {copyAllLabel}
          </Button>
        </div>
      </section>

      <section className="password-workbench">
        <div className="single-main">
          <section className="editor-panel password-result-panel">
            <div className="panel-topbar">
              <div className="panel-title">生成结果</div>
              <div className="panel-actions">
                <span className={`health-badge ${healthKind}`}>{healthText}</span>
              </div>
            </div>
            <div className="port-table-shell password-table-shell">
              <table className="port-table password-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>值</th>
                    <th>长度</th>
                    <th>类型/强度</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="mono-cell">{index + 1}</td>
                      <td className="mono-cell password-value">{row.value}</td>
                      <td className="mono-cell">{row.length}</td>
                      <td>
                        <span className={`strength-badge ${qualityClass(row.quality.kind)}`}>{row.type}</span>
                      </td>
                      <td className="password-copy-cell">
                        <Button className="password-row-copy" onClick={() => void copyOne(row, index)}>
                          {copiedIndex === index ? "已复制" : "复制"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="editor-footer">
              <span>{statusText}</span>
              <span>Crypto Random</span>
            </div>
          </section>
        </div>

        <aside className="side-stack password-side-stack">
          <section className="inspector-panel password-settings-panel">
            <div className="inspector-heading">
              <div className="inspector-title">生成设置</div>
              <span className={`health-badge ${healthKind}`}>{healthText}</span>
            </div>
            <div className="password-settings-grid">
              <Field label="数量">
                <input
                  aria-label="数量"
                  max={100}
                  min={1}
                  onBlur={commitCount}
                  onChange={(event) => setCountInput(event.target.value)}
                  type="number"
                  value={countInput}
                />
              </Field>
              <Field label="长度">
                <div className="password-range-row">
                  <input
                    aria-label="长度滑块"
                    disabled={mode === "uuid"}
                    max={mode === "uuid" ? 36 : 128}
                    min={mode === "uuid" ? 36 : 4}
                    onChange={(event) => updateLength(Number(event.target.value))}
                    type="range"
                    value={modeLength}
                  />
                  <input
                    aria-label="长度"
                    disabled={mode === "uuid"}
                    max={mode === "uuid" ? 36 : 128}
                    min={mode === "uuid" ? 36 : 4}
                    onChange={(event) => updateLength(Number(event.target.value))}
                    type="number"
                    value={modeLength}
                  />
                </div>
              </Field>
              <Field label="排除字符">
                <input
                  aria-label="排除字符"
                  disabled={mode !== "password"}
                  onChange={(event) => setExclude(event.target.value)}
                  placeholder={'0OIl1\'"\\'}
                  spellCheck={false}
                  type="text"
                  value={exclude}
                />
                <span className="field-hint">这些字符会从密码字符池和必选类别中剔除。</span>
              </Field>
            </div>
          </section>

          {mode === "password" ? (
            <section className="inspector-panel password-options-panel">
              <div className="inspector-heading">
                <div className="inspector-title">密码字符</div>
                <span className={`strength-badge ${qualityClass(result.quality.kind)}`}>{result.quality.text}</span>
              </div>
              <div className="password-character-grid">
                <SwitchToggle checked={lower} onChange={setLower} title="小写" hint="a-z" />
                <SwitchToggle checked={upper} onChange={setUpper} title="大写" hint="A-Z" />
                <SwitchToggle checked={numbers} onChange={setNumbers} title="数字" hint="0-9" />
                <Field label="符号">
                  <input aria-label="符号" onChange={(event) => setSymbols(event.target.value)} spellCheck={false} type="text" value={symbols} />
                </Field>
              </div>
            </section>
          ) : null}

          <Panel
            title={
              <>
                <ShieldCheck size={15} /> 随机策略
              </>
            }
          >
            <div className="tiny-list">
              <div className="tiny-row">
                <span>字符池</span>
                <code>{poolText}</code>
              </div>
              <div className="tiny-row">
                <span>规则</span>
                <code>{result.rule}</code>
              </div>
              <div className="tiny-row">
                <span>随机源</span>
                <code>Web Crypto</code>
              </div>
            </div>
          </Panel>
        </aside>
      </section>
    </section>
  );
}
