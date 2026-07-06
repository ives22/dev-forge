import { ArrowDown, ArrowUp, Copy, Download, FileCode2, FileUp, Play, Repeat2, ShieldCheck, SlidersHorizontal, Upload } from "lucide-react";
import { useId, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { Button, EditorPanel, SegmentButton, SwitchToggle } from "../components/Panel";
import { copyText, saveTextFile } from "../lib/desktop";
import { usePageChrome } from "../hooks/usePageChrome";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import { base64Metrics, transformBase64, type Base64Mode } from "../lib/tools/base64";
import { formatBytes } from "../lib/utils";

export function Base64Page({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const fileInputId = useId();
  const [mode, setMode] = useState<Base64Mode>("encode");
  const [input, setInput] = useState("DevForge Base64 工具 · 支持 UTF-8 中文、URL Safe 变体和换行输出。");
  const [urlSafe, setUrlSafe] = useState(false);
  const [lineWrap, setLineWrap] = useState(true);
  const [padding, setPadding] = useState(true);
  const [fileStatus, setFileStatus] = useState("未选择文件");

  const result = useMemo(() => transformBase64(input, { mode, urlSafe, lineWrap, padding }), [input, lineWrap, mode, padding, urlSafe]);
  const metrics = base64Metrics(result);
  const statusMetrics = [
    { label: "输入", value: metrics.input },
    { label: "输出", value: metrics.output },
    { label: "比例", value: metrics.ratio }
  ];
  usePageChrome({
    tool: toolById.base64,
    metrics: statusMetrics
  });

  const persist = async (action: string) => {
    await recordUsage({ toolId: "base64", action, input, output: result.output, status: result.ok ? "ok" : "error" });
  };

  const loadSample = () => {
    setInput(mode === "encode" ? '{"tool":"DevForge","locale":"zh-CN"}' : "eyJ0b29sIjoiRGV2Rm9yZ2UiLCJsb2NhbGUiOiJ6aC1DTiJ9");
  };

  const loadFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") return;
      setInput(reader.result);
      setMode("decode");
      setFileStatus(`${file.name} · ${formatBytes(file.size)}`);
    });
    reader.addEventListener("error", () => {
      setFileStatus(`${file.name} · 读取失败`);
    });
    reader.readAsDataURL(file);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleFileDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    loadFile(event.dataTransfer.files?.[0]);
  };

  return (
    <section className="tool-shell">
      <div className="mode-strip">
        <div className="segmented-control">
          <SegmentButton active={mode === "encode"} onClick={() => setMode("encode")}>
            <ArrowUp size={15} />
            编码
          </SegmentButton>
          <SegmentButton active={mode === "decode"} onClick={() => setMode("decode")}>
            <ArrowDown size={15} />
            解码
          </SegmentButton>
        </div>
        <div className="mode-tools">
          <span className="format-badge">
            <SlidersHorizontal size={13} />
            {urlSafe ? "URL Safe Base64" : "Standard Base64"}
          </span>
          <Button onClick={loadSample}>示例</Button>
          <Button variant="primary" onClick={() => void persist(mode === "encode" ? "encode" : "decode")}>
            <Play size={14} /> 运行
          </Button>
        </div>
      </div>
      <section className="workbench-grid">
        <div className="editor-stack">
          <EditorPanel
            className="base64-input-panel"
            title={
              <>
                <Upload size={16} /> 输入
              </>
            }
            actions={
              <>
                <Button onClick={() => setInput("")}>清空</Button>
                <Button onClick={() => setInput("data:text/plain;base64,RGV2Rm9yZ2U=")}>Data URI</Button>
              </>
            }
            value={input}
            onChange={setInput}
            rows={6}
            showLineNumbers={false}
            footerLeft={
              <>
                UTF-8 · <strong>{input.length.toLocaleString()}</strong> chars · <strong>{metrics.input}</strong>
              </>
            }
            footerRight="自动检测文本输入"
          />
          <div className="swap-bar">
            <button
              className="swap-btn"
              type="button"
              aria-label="交换输入输出"
              onClick={() => {
                setInput(result.output);
                setMode(mode === "encode" ? "decode" : "encode");
              }}
            >
              <Repeat2 size={18} />
            </button>
          </div>
          <EditorPanel
            className="base64-output-panel"
            title={
              <>
                <Download size={16} /> 输出
              </>
            }
            actions={
              <>
                <Button onClick={() => void copyText(result.output).then(() => persist("copy"))}>
                  <Copy size={14} /> 复制
                </Button>
                <Button onClick={() => void saveTextFile("devforge-base64.txt", result.output).then(() => persist("export"))}>
                  <Download size={14} /> 导出
                </Button>
              </>
            }
            value={result.output || result.error || ""}
            readOnly
            rows={6}
            showLineNumbers={false}
            footerLeft={<span className={result.ok ? "" : "error-text"}>{result.ok ? `${metrics.output} · ${result.output.length.toLocaleString()} chars` : result.error}</span>}
            footerRight={result.ok ? (mode === "encode" ? "Encoded" : "Decoded") : "Error"}
          />
          <section className="options-grid" aria-label="Base64 选项">
            <SwitchToggle checked={urlSafe} onChange={setUrlSafe} title="URL Safe" hint="将 + / 替换为 - _" />
            <SwitchToggle checked={lineWrap} onChange={setLineWrap} title="76 列换行" hint="适合 PEM 与邮件正文" />
            <SwitchToggle checked={padding} onChange={setPadding} title="保留补齐" hint="输出末尾包含 =" />
          </section>
        </div>

        <aside className="side-stack" aria-label="Base64 辅助信息">
          <section className="inspector-panel">
            <div className="inspector-heading">
              <div className="inspector-title">
                <ShieldCheck size={16} />
                输入检测
              </div>
              <span className={`health-badge ${result.ok ? "" : "error"}`}>{result.ok ? "有效" : "错误"}</span>
            </div>
            <div className="analysis-list">
              <div className="analysis-row">
                <span className="analysis-label">字符集</span>
                <span className="analysis-value">UTF-8</span>
              </div>
              <div className="analysis-row">
                <span className="analysis-label">格式</span>
                <span className="analysis-value">{result.variant}</span>
              </div>
              <div className="analysis-row">
                <span className="analysis-label">填充</span>
                <span className="analysis-value">{result.padding}</span>
              </div>
              <div className="analysis-row">
                <span className="analysis-label">换行</span>
                <span className="analysis-value">{result.wrap}</span>
              </div>
            </div>
          </section>
          <section className="inspector-panel">
            <div className="inspector-heading">
              <div className="inspector-title">
                <FileUp size={16} />
                文件输入
              </div>
            </div>
            <input id={fileInputId} className="sr-only" type="file" aria-label="选择文件转换为 Base64" onChange={handleFileChange} />
            <label className="drop-zone" htmlFor={fileInputId} onDragOver={(event) => event.preventDefault()} onDrop={handleFileDrop}>
              <div className="drop-icon">
                <FileCode2 size={21} />
              </div>
              <div>
                <div className="drop-title">拖入文件或点击选择</div>
                <div className="drop-copy">将文件读取为 Base64 文本，或从 Data URI 中提取正文。</div>
              </div>
              <div className="file-status">{fileStatus}</div>
            </label>
          </section>
        </aside>
      </section>
    </section>
  );
}
