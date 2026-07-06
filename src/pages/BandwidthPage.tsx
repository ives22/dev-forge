import { useMemo, useState } from "react";
import { Button, Field, Panel } from "../components/Panel";
import { usePageChrome } from "../hooks/usePageChrome";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import { bandwidthUnits, calculateBandwidth, convertBandwidth, fileSizeUnits, type BandwidthUnit, type FileSizeUnit } from "../lib/tools/bandwidth";

export function BandwidthPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [fileSize, setFileSize] = useState(1.5);
  const [fileUnit, setFileUnit] = useState<FileSizeUnit>("GB");
  const [bandwidth, setBandwidth] = useState(100);
  const [bandUnit, setBandUnit] = useState<BandwidthUnit>("Mbps");
  const [efficiency, setEfficiency] = useState(90);
  const [parallel, setParallel] = useState(1);
  const [convertValue, setConvertValue] = useState(100);
  const [convertFrom, setConvertFrom] = useState<BandwidthUnit>("Mbps");

  const result = useMemo(() => calculateBandwidth({ fileSize, fileUnit, bandwidth, bandUnit, efficiency, parallel }), [bandUnit, bandwidth, efficiency, fileSize, fileUnit, parallel]);
  const converted = useMemo(() => convertBandwidth(convertValue, convertFrom), [convertFrom, convertValue]);
  usePageChrome({
    tool: toolById.bandwidth
  });

  const sample = () => {
    setFileSize(4.7);
    setFileUnit("GB");
    setBandwidth(500);
    setBandUnit("Mbps");
    setEfficiency(88);
    setParallel(2);
    setConvertValue(500);
    setConvertFrom("Mbps");
  };

  return (
    <section className="tool-shell">
      <div className="single-workbench">
        <div className="single-main">
          <Panel
            className="bandwidth-transfer-panel"
            title="传输耗时"
            actions={
              <>
                <Button onClick={sample}>示例</Button>
                <Button variant="primary" onClick={() => void recordUsage({ toolId: "bandwidth", action: "calculate", input: `${fileSize}${fileUnit} @ ${bandwidth}${bandUnit}`, output: result.duration, status: result.throughputBytes > 0 ? "ok" : "warn" })}>
                  计算
                </Button>
              </>
            }
          >
            <div className="form-grid">
              <Field label="文件大小">
                <input type="number" value={fileSize} onChange={(event) => setFileSize(Number(event.target.value))} />
              </Field>
              <Field label="单位">
                <select value={fileUnit} onChange={(event) => setFileUnit(event.target.value as FileSizeUnit)}>
                  {Object.keys(fileSizeUnits).map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </Field>
              <Field label="带宽">
                <input type="number" value={bandwidth} onChange={(event) => setBandwidth(Number(event.target.value))} />
              </Field>
              <Field label="单位">
                <select value={bandUnit} onChange={(event) => setBandUnit(event.target.value as BandwidthUnit)}>
                  {Object.keys(bandwidthUnits).map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </Field>
              <Field label="协议效率">
                <input type="number" value={efficiency} onChange={(event) => setEfficiency(Number(event.target.value))} />
              </Field>
              <Field label="并发连接">
                <input type="number" value={parallel} onChange={(event) => setParallel(Number(event.target.value))} />
              </Field>
            </div>
            <div className="result-grid">
              <div className="result-card">
                <span>预计耗时</span>
                <strong>{result.duration}</strong>
              </div>
              <div className="result-card">
                <span>每秒传输</span>
                <strong>{result.perSecond}</strong>
              </div>
              <div className="result-card">
                <span>5 分钟可传</span>
                <strong>{result.fiveMinutes}</strong>
              </div>
            </div>
          </Panel>
          <Panel className="bandwidth-convert-panel" title="带宽单位换算">
            <div className="form-grid">
              <Field label="数值">
                <input type="number" value={convertValue} onChange={(event) => setConvertValue(Number(event.target.value))} />
              </Field>
              <Field label="源单位">
                <select value={convertFrom} onChange={(event) => setConvertFrom(event.target.value as BandwidthUnit)}>
                  {Object.keys(bandwidthUnits).map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="convert-result-grid">
              {converted.values.map((item) => (
                <div className="convert-unit-card" key={item.unit}>
                  <div className="convert-unit-label">{item.unit}</div>
                  <div className="convert-unit-value">{item.formatted}</div>
                </div>
              ))}
            </div>
            <div className="convert-note">{converted.note}</div>
          </Panel>
        </div>
        <aside className="side-stack">
          <Panel className="bandwidth-status-card" title="当前估算">
            <div className="bandwidth-status-grid">
              <div className="bandwidth-status-item is-primary">
                <span>预计耗时</span>
                <strong>{result.duration}</strong>
              </div>
              <div className="bandwidth-status-item">
                <span>有效吞吐</span>
                <strong>{result.perSecond}</strong>
              </div>
              <div className="bandwidth-status-item">
                <span>协议效率</span>
                <strong>{efficiency}%</strong>
              </div>
            </div>
          </Panel>
          <Panel title="常用换算">
            <div className="tiny-list">
              <div className="tiny-row">
                <span>100 Mbps</span>
                <code>12.5 MB/s</code>
              </div>
              <div className="tiny-row">
                <span>1 Gbps</span>
                <code>125 MB/s</code>
              </div>
              <div className="tiny-row">
                <span>10 Gbps</span>
                <code>1.25 GB/s</code>
              </div>
              <div className="tiny-row">
                <span>1 MiB/s</span>
                <code>8.39 Mbps</code>
              </div>
            </div>
          </Panel>
          <Panel title="当前吞吐">
            <div className="tiny-list">
              <div className="tiny-row">
                <span>有效速率</span>
                <code>{result.perSecond}</code>
              </div>
              <div className="tiny-row">
                <span>并发连接</span>
                <code>{parallel}</code>
              </div>
              <div className="tiny-row">
                <span>协议效率</span>
                <code>{efficiency}%</code>
              </div>
            </div>
          </Panel>
        </aside>
      </div>
    </section>
  );
}
