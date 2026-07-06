import { useEffect, useMemo, useState } from "react";
import { Button, Field, Panel } from "../components/Panel";
import { usePageChrome } from "../hooks/usePageChrome";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import { calculateTimeDiff, convertTimestamp, formatInZone, type TimeInputType } from "../lib/tools/timestamp";

const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const zones = Array.from(new Set([localZone, "UTC", "Asia/Shanghai", "Asia/Tokyo", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles"]));

export function TimestampPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [now, setNow] = useState(new Date());
  const [input, setInput] = useState("1700000000");
  const [type, setType] = useState<TimeInputType>("auto");
  const [zone, setZone] = useState(localZone);
  const [diffStart, setDiffStart] = useState("1700000000");
  const [diffEnd, setDiffEnd] = useState("1700086400");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const converted = useMemo(() => convertTimestamp(input, type, zone), [input, type, zone]);
  const diff = useMemo(() => calculateTimeDiff(diffStart, diffEnd), [diffEnd, diffStart]);
  const unixSeconds = Math.floor(now.getTime() / 1000);
  const unixMilliseconds = now.getTime();
  usePageChrome({
    tool: toolById.timestamp
  });

  const persist = async (action: string) => {
    await recordUsage({ toolId: "timestamp", action, input, output: converted.iso, status: converted.ok ? "ok" : "error" });
  };

  return (
    <section className="tool-shell">
      <div className="timestamp-grid">
        <Panel className="clock-card" title="当前时间">
          <div className="clock-value">{formatInZone(now, zone)}</div>
          <div className="zone-note">{zone}</div>
          <div className="clock-format-grid" aria-label="当前时间戳格式">
            <div className="clock-format-chip">
              <span>Unix 秒</span>
              <strong>{unixSeconds}</strong>
            </div>
            <div className="clock-format-chip">
              <span>毫秒</span>
              <strong>{unixMilliseconds}</strong>
            </div>
          </div>
        </Panel>
        <Panel
          title="转换"
          actions={
            <>
              <Button onClick={() => setInput(String(Math.floor(Date.now() / 1000)))}>现在</Button>
              <Button variant="primary" onClick={() => void persist("convert")}>
                转换
              </Button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="输入">
              <input value={input} onChange={(event) => setInput(event.target.value)} />
            </Field>
            <Field label="类型">
              <select value={type} onChange={(event) => setType(event.target.value as TimeInputType)}>
                <option value="auto">自动识别</option>
                <option value="s">Unix 秒</option>
                <option value="ms">Unix 毫秒</option>
                <option value="iso">日期字符串</option>
              </select>
            </Field>
            <Field label="时区">
              <select value={zone} onChange={(event) => setZone(event.target.value)}>
                {zones.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="zone-note">类型：{converted.type}</div>
        </Panel>
      </div>
      <div className="result-grid">
        <div className="result-card">
          <span>目标时区时间</span>
          <strong>{converted.zoneTime}</strong>
        </div>
        <div className="result-card">
          <span>ISO</span>
          <strong>{converted.iso}</strong>
        </div>
        <div className="result-card">
          <span>相对当前</span>
          <strong>{converted.relative}</strong>
        </div>
      </div>
      <div className="single-workbench">
        <div className="single-main">
          <Panel title="时间差计算" actions={<Button variant="primary" onClick={() => void recordUsage({ toolId: "timestamp", action: "diff", input: `${diffStart} -> ${diffEnd}`, output: diff.human, status: diff.ok ? "ok" : "error" })}>计算</Button>}>
            <div className="diff-grid">
              <Field label="开始">
                <input value={diffStart} onChange={(event) => setDiffStart(event.target.value)} />
              </Field>
              <Field label="结束">
                <input value={diffEnd} onChange={(event) => setDiffEnd(event.target.value)} />
              </Field>
            </div>
            <div className="diff-result-grid">
              <div className="result-card">
                <span>总秒数</span>
                <strong className="result-value small">{diff.seconds}</strong>
              </div>
              <div className="result-card">
                <span>分钟</span>
                <strong className="result-value small">{diff.minutes}</strong>
              </div>
              <div className="result-card">
                <span>小时</span>
                <strong className="result-value small">{diff.hours}</strong>
              </div>
              <div className="result-card">
                <span>可读</span>
                <strong className="result-value small">{diff.human}</strong>
              </div>
            </div>
          </Panel>
        </div>
        <aside className="side-stack">
          <Panel title="快速偏移">
            <div className="button-grid">
              {[3600, 86400, 604800, -86400].map((offset) => (
                <Button
                  key={offset}
                  onClick={() => {
                    const base = converted.ok ? converted.date.getTime() : Date.now();
                    setInput(String(Math.floor((base + offset * 1000) / 1000)));
                    setType("auto");
                  }}
                >
                  {offset > 0 ? "+" : ""}
                  {offset === 3600 ? "1h" : `${offset / 86400}d`}
                </Button>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </section>
  );
}
