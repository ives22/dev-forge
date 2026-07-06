import { Copy, Dice5, RefreshCw, SwatchBook } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Field, Panel, SegmentButton } from "../components/Panel";
import { usePageChrome } from "../hooks/usePageChrome";
import { copyText } from "../lib/desktop";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import { clampPaletteCount, generatePalette, paletteModes, randomPaletteHex, type PaletteMode } from "../lib/tools/palette";

const modeOrder: PaletteMode[] = ["analogous", "complementary", "triadic", "monochrome"];
const presetColors = ["#2563EB", "#16A34A", "#DC2626", "#F59E0B", "#0891B2", "#DB2777", "#7C3AED", "#0F172A"];

export function PalettePage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [baseHex, setBaseHex] = useState("#2563EB");
  const [mode, setMode] = useState<PaletteMode>("analogous");
  const [count, setCount] = useState(6);
  const [copyLabel, setCopyLabel] = useState("复制 HEX");
  const [cssCopyLabel, setCssCopyLabel] = useState("复制 CSS");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const result = useMemo(() => generatePalette({ baseHex, mode, count }), [baseHex, count, mode]);
  const selectedColor = result.colors[Math.min(selectedIndex, result.colors.length - 1)] ?? result.colors[0];

  usePageChrome({
    tool: toolById.palette,
    kicker: "色板、HEX、RGB、HSL 与 CSS 变量",
    metrics: [
      { label: "模式", value: result.modeLabel },
      { label: "色数", value: result.colors.length },
      { label: "基准", value: result.baseHex }
    ]
  });

  const updateCount = (value: number) => {
    setCount(clampPaletteCount(value));
    setSelectedIndex((current) => Math.min(current, clampPaletteCount(value) - 1));
  };

  const copyValue = async (value: string, label: "hex" | "css" | "single") => {
    if (label === "hex") setCopyLabel("已复制");
    if (label === "css") setCssCopyLabel("已复制");
    try {
      await copyText(value);
      await recordUsage({
        toolId: "palette",
        action: label === "css" ? "copy-css" : label === "single" ? "copy-color" : "copy-hex",
        input: `${result.modeLabel} ${result.baseHex}`,
        output: label === "single" ? "1 color copied" : `${result.colors.length} colors copied`,
        status: "ok"
      });
    } catch {
      await recordUsage({
        toolId: "palette",
        action: label === "css" ? "copy-css" : label === "single" ? "copy-color" : "copy-hex",
        input: `${result.modeLabel} ${result.baseHex}`,
        output: "copy unavailable",
        status: "warn"
      });
    } finally {
      window.setTimeout(() => {
        if (label === "hex") setCopyLabel("复制 HEX");
        if (label === "css") setCssCopyLabel("复制 CSS");
      }, 900);
    }
  };

  return (
    <section className="tool-shell palette-tool-shell" aria-label="配色方案">
      <section className="mode-strip palette-mode-strip" aria-label="配色模式">
        <div className="segmented-control palette-mode-control" role="tablist" aria-label="配色模式">
          {modeOrder.map((item) => (
            <SegmentButton active={mode === item} key={item} onClick={() => setMode(item)} role="tab" aria-selected={mode === item}>
              {paletteModes[item].label}
            </SegmentButton>
          ))}
        </div>
        <div className="mode-tools">
          <span className="format-badge">基准 {result.baseHex}</span>
          <span className="format-badge">色数 {result.colors.length}</span>
          <Button onClick={() => setBaseHex(result.baseHex)}>
            <RefreshCw size={14} /> 归一化
          </Button>
          <Button onClick={() => setBaseHex(randomPaletteHex())}>
            <Dice5 size={14} /> 随机
          </Button>
          <Button className="palette-copy-btn" variant="primary" onClick={() => void copyValue(result.hexList, "hex")}>
            {copyLabel}
          </Button>
        </div>
      </section>

      <section className="palette-workbench">
        <div className="single-main palette-main">
          <section className="editor-panel palette-result-panel">
            <div className="panel-topbar">
              <div className="panel-title">
                <SwatchBook size={15} /> 生成色板
              </div>
              <div className="panel-actions">
                <span className={`health-badge ${result.validBase ? "" : "warning"}`}>{result.validBase ? "Ready" : "已使用默认基准色"}</span>
              </div>
            </div>
            <div className="palette-strip" aria-label="生成色板">
              {result.colors.map((color, index) => (
                <button
                  aria-label={`${color.role} ${color.hex}`}
                  className={`palette-swatch ${index === selectedIndex ? "active" : ""}`}
                  key={color.id}
                  onClick={() => setSelectedIndex(index)}
                  style={{ backgroundColor: color.hex, color: color.textColor }}
                  type="button"
                >
                  <span>{color.role}</span>
                  <strong>{color.hex}</strong>
                </button>
              ))}
            </div>
            <div className="palette-card-grid">
              {result.colors.map((color, index) => (
                <button
                  className={`palette-color-card ${index === selectedIndex ? "active" : ""}`}
                  key={color.id}
                  onClick={() => setSelectedIndex(index)}
                  type="button"
                >
                  <span className="palette-card-chip" style={{ backgroundColor: color.hex }} />
                  <span className="palette-card-meta">
                    <strong>{color.role}</strong>
                    <code>{color.hex}</code>
                  </span>
                  <span className="palette-card-contrast">{color.contrast}:1</span>
                </button>
              ))}
            </div>
            <div className="editor-footer">
              <span>{result.modeLabel} · {paletteModes[mode].description}</span>
              <span>{result.colors.length} colors</span>
            </div>
          </section>
        </div>

        <aside className="side-stack palette-side-stack">
          <section className="inspector-panel palette-settings-panel">
            <div className="inspector-heading">
              <div className="inspector-title">生成设置</div>
              <span className="health-badge">{result.modeLabel}</span>
            </div>
            <div className="palette-settings-grid">
              <Field label="基准色">
                <div className="palette-base-row">
                  <input aria-label="基准色选择" onChange={(event) => setBaseHex(event.target.value)} type="color" value={result.baseHex} />
                  <input aria-label="基准色 HEX" onChange={(event) => setBaseHex(event.target.value)} spellCheck={false} value={baseHex} />
                </div>
              </Field>
              <Field label="色板数量">
                <div className="palette-count-row">
                  <input aria-label="色板数量滑块" max={9} min={3} onChange={(event) => updateCount(Number(event.target.value))} type="range" value={count} />
                  <input aria-label="色板数量" max={9} min={3} onChange={(event) => updateCount(Number(event.target.value))} type="number" value={count} />
                </div>
              </Field>
              <div className="palette-preset-row" aria-label="预设颜色">
                {presetColors.map((color) => (
                  <button
                    aria-label={`使用 ${color}`}
                    className={result.baseHex === color ? "active" : ""}
                    key={color}
                    onClick={() => setBaseHex(color)}
                    style={{ backgroundColor: color }}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </section>

          <Panel
            title={
              <>
                <Copy size={15} /> 当前色值
              </>
            }
          >
            <div className="tiny-list">
              <div className="tiny-row">
                <span>HEX</span>
                <code>{selectedColor.hex}</code>
              </div>
              <div className="tiny-row">
                <span>RGB</span>
                <code>{selectedColor.rgbText}</code>
              </div>
              <div className="tiny-row">
                <span>HSL</span>
                <code>{selectedColor.hslText}</code>
              </div>
              <div className="tiny-row">
                <span>文本色</span>
                <code>{selectedColor.textColor}</code>
              </div>
            </div>
            <div className="button-grid">
              <Button onClick={() => void copyValue(selectedColor.hex, "single")}>复制当前</Button>
            </div>
          </Panel>

          <Panel title="导出">
            <pre className="palette-code-preview" aria-label="CSS 变量">
              {result.cssVariables}
            </pre>
            <div className="button-grid">
              <Button className="palette-copy-btn" variant="primary" onClick={() => void copyValue(result.cssVariables, "css")}>
                {cssCopyLabel}
              </Button>
            </div>
          </Panel>
        </aside>
      </section>
    </section>
  );
}
