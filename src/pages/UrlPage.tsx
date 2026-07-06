import { Copy, Repeat2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, EditorPanel, Panel, SegmentButton, SwitchToggle } from "../components/Panel";
import { copyText } from "../lib/desktop";
import { usePageChrome } from "../hooks/usePageChrome";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import { transformUrl, type UrlMode } from "../lib/tools/url";

export function UrlPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [mode, setMode] = useState<UrlMode>("encode");
  const [input, setInput] = useState("https://devforge.app/search?q=开发者工具&mode=fast");
  const [spacePlus, setSpacePlus] = useState(false);
  const result = useMemo(() => transformUrl(input, { mode, spacePlus }), [input, mode, spacePlus]);
  const metrics = [
    { label: "输入", value: result.inputLength },
    { label: "输出", value: result.outputLength },
    { label: "参数", value: result.params.length }
  ];
  usePageChrome({
    tool: toolById.url,
    metrics
  });

  const persist = async (action: string) => {
    await recordUsage({ toolId: "url", action, input, output: result.output, status: result.ok ? "ok" : "error" });
  };

  const swapInputOutput = () => {
    setInput(result.output);
    setMode(mode === "encode" ? "decode" : "encode");
  };

  return (
    <section className="tool-shell">
      <div className="mode-strip">
        <div className="segmented-control">
          <SegmentButton active={mode === "encode"} onClick={() => setMode("encode")}>
            编码
          </SegmentButton>
          <SegmentButton active={mode === "decode"} onClick={() => setMode("decode")}>
            解码
          </SegmentButton>
        </div>
        <div className="mode-tools">
          <Button onClick={() => setInput("name=DevForge 工具箱&redirect=https://example.com/a b")}>示例</Button>
          <Button variant="primary" onClick={() => void persist(mode)}>
            运行
          </Button>
        </div>
      </div>
      <div className="single-workbench">
        <div className="single-main url-editor-stack">
          <EditorPanel
            title="输入"
            actions={<Button onClick={() => setInput("")}>清空</Button>}
            value={input}
            onChange={setInput}
            footerLeft={`${input.length} chars`}
            footerRight="UTF-8"
            className="url-editor-panel"
            showLineNumbers={false}
          />
          <div className="url-swap-bar">
            <button className="swap-btn" type="button" aria-label="交换输入输出" onClick={swapInputOutput}>
              <Repeat2 size={18} />
            </button>
          </div>
          <EditorPanel
            title="输出"
            actions={
              <Button onClick={() => void copyText(result.output).then(() => persist("copy"))}>
                <Copy size={14} /> 复制
              </Button>
            }
            value={result.output}
            readOnly
            footerLeft={<span className={result.ok ? "" : "error-text"}>{result.ok ? "Ready" : result.error}</span>}
            footerRight={mode === "encode" ? "Encoded" : "Decoded"}
            className="url-editor-panel"
            showLineNumbers={false}
          />
        </div>
        <aside className="side-stack">
          <Panel title="Query 参数">
            <div className="tiny-list">
              {result.params.length ? (
                result.params.map((param) => (
                  <div className="tiny-row" key={`${param.key}:${param.value}`}>
                    <span>{param.key}</span>
                    <code>{param.value}</code>
                  </div>
                ))
              ) : (
                <div className="tiny-row">
                  <span>未检测到 query</span>
                  <code>-</code>
                </div>
              )}
            </div>
          </Panel>
          <Panel title="选项">
            <SwitchToggle checked={spacePlus} onChange={setSpacePlus} title="空格转 +" hint="表单编码兼容" />
          </Panel>
        </aside>
      </div>
    </section>
  );
}
