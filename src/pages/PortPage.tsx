import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Field, SegmentButton, SwitchToggle } from "../components/Panel";
import { copyText, listPorts } from "../lib/desktop";
import { usePageChrome } from "../hooks/usePageChrome";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import {
  defaultPortFilterOptions,
  filterPorts,
  portMetrics,
  portsToTsv,
  summarizeProcesses,
  type PortEntry,
  type PortFilterValue,
  type PortProtocol,
  type PortSortKey,
  type PortStatus
} from "../lib/tools/port";

type ScanState = "Ready" | "Empty" | "Error" | "刷新中" | "示例";

const statusOptions: Array<PortFilterValue<PortStatus>> = ["ALL", "LISTEN", "BOUND", "ESTABLISHED"];
const protocolOptions: Array<PortFilterValue<PortProtocol>> = ["ALL", "TCP", "UDP"];

function statusClass(status: PortStatus) {
  return status.toLowerCase();
}

function footerLabel(sortKey: PortSortKey, sortDir: 1 | -1) {
  return `${sortKey.toUpperCase()} ${sortDir > 0 ? "升序" : "降序"} · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
}

export function PortPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [rows, setRows] = useState<PortEntry[]>([]);
  const [keyword, setKeyword] = useState(defaultPortFilterOptions.keyword);
  const [protocol, setProtocol] = useState<PortFilterValue<PortProtocol>>(defaultPortFilterOptions.protocol);
  const [status, setStatus] = useState<PortFilterValue<PortStatus>>(defaultPortFilterOptions.status);
  const [listenOnly, setListenOnly] = useState(defaultPortFilterOptions.listenOnly);
  const [localOnly, setLocalOnly] = useState(defaultPortFilterOptions.localOnly);
  const [sortKey, setSortKey] = useState<PortSortKey>(defaultPortFilterOptions.sortKey);
  const [sortDir, setSortDir] = useState<1 | -1>(defaultPortFilterOptions.sortDir);
  const [scanState, setScanState] = useState<ScanState>("刷新中");
  const [source, setSource] = useState<"system" | "sample">("sample");
  const [copyLabel, setCopyLabel] = useState("复制");

  const visibleRows = useMemo(
    () => filterPorts(rows, { keyword, protocol, status, listenOnly, localOnly, sortKey, sortDir }),
    [keyword, listenOnly, localOnly, protocol, rows, sortDir, sortKey, status]
  );
  const metrics = useMemo(() => portMetrics(visibleRows), [visibleRows]);
  const processSummary = useMemo(() => summarizeProcesses(visibleRows), [visibleRows]);
  const statusMetrics = [
    { label: "监听", value: metrics.listen },
    { label: "TCP", value: metrics.tcp },
    { label: "进程", value: metrics.process }
  ];
  usePageChrome({
    tool: toolById.port,
    kicker: "监听端口、进程与 PID 排查",
    metrics: statusMetrics
  });

  const refresh = async () => {
    setScanState("刷新中");
    try {
      const result = await listPorts();
      setRows(result.rows);
      setSource(result.source);
      setScanState(result.source === "sample" ? "示例" : result.rows.length ? "Ready" : "Empty");
    } catch {
      setScanState("Error");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (scanState === "Error" || scanState === "刷新中" || source === "sample") return;
    setScanState(visibleRows.length ? "Ready" : "Empty");
  }, [scanState, source, visibleRows.length]);

  const handleSort = (key: PortSortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 1 ? -1 : 1);
      return;
    }
    setSortKey(key);
    setSortDir(1);
  };

  const loadSampleFilter = () => {
    setKeyword("node");
    setProtocol("ALL");
    setStatus("ALL");
    setListenOnly(true);
    setLocalOnly(false);
  };

  const copyVisibleRows = async () => {
    await copyText(portsToTsv(visibleRows));
    setCopyLabel("已复制");
    window.setTimeout(() => setCopyLabel("复制"), 900);
    await recordUsage({
      toolId: "port",
      action: "copy",
      input: `${visibleRows.length} rows`,
      output: portsToTsv(visibleRows),
      status: visibleRows.length ? "ok" : "warn"
    });
  };

  const stateClass = scanState === "Error" ? "error" : scanState === "Empty" || scanState === "示例" ? "warning" : "";

  return (
    <section className="tool-shell" aria-label="端口占用工具">
      <section className="mode-strip" aria-label="端口筛选">
        <label className="port-search">
          <Search size={15} aria-hidden="true" />
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} type="search" placeholder="搜索端口、PID、监听地址或进程" />
        </label>
        <div className="segmented-control" role="tablist" aria-label="协议筛选">
          {protocolOptions.map((item) => (
            <SegmentButton key={item} active={protocol === item} onClick={() => setProtocol(item)}>
              {item === "ALL" ? "全部" : item}
            </SegmentButton>
          ))}
        </div>
        <div className="mode-tools">
          <Button onClick={loadSampleFilter}>示例</Button>
          <Button onClick={() => void refresh()}>刷新</Button>
          <Button variant="primary" onClick={() => void copyVisibleRows()}>
            {copyLabel}
          </Button>
        </div>
      </section>

      <section className="port-workbench">
        <div className="single-main">
          <section className="editor-panel port-table-panel">
            <div className="panel-topbar">
              <div className="panel-title">端口占用列表</div>
              <div className="panel-actions">
                <span className="format-badge">{visibleRows.length} 项</span>
              </div>
            </div>
            <div className="port-table-shell">
              <table className="port-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort("port")}>端口</th>
                    <th onClick={() => handleSort("protocol")}>协议</th>
                    <th onClick={() => handleSort("address")}>监听地址</th>
                    <th onClick={() => handleSort("status")}>状态</th>
                    <th onClick={() => handleSort("pid")}>PID</th>
                    <th onClick={() => handleSort("process")}>进程</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length ? (
                    visibleRows.map((row) => (
                      <tr key={`${row.protocol}-${row.address}-${row.port}-${row.pid}-${row.process}-${row.status}`}>
                        <td className="mono-cell port-cell">{row.port}</td>
                        <td>
                          <span className={`protocol-badge ${row.protocol.toLowerCase()}`}>{row.protocol}</span>
                        </td>
                        <td className="mono-cell">{row.address}</td>
                        <td>
                          <span className={`status-badge ${statusClass(row.status)}`}>{row.status}</span>
                        </td>
                        <td className="mono-cell">{row.pid}</td>
                        <td>
                          <span className="process-cell">
                            <span className={`process-dot ${row.group}`} />
                            {row.process}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="empty-row" colSpan={6}>
                        没有匹配的端口占用
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="editor-footer">
              <span>{footerLabel(sortKey, sortDir)}</span>
              <span>{source === "system" ? "Local Snapshot" : "Sample Snapshot"}</span>
            </div>
          </section>
        </div>

        <aside className="side-stack">
          <section className="inspector-panel">
            <div className="inspector-heading">
              <div className="inspector-title">过滤</div>
              <span className={`health-badge ${stateClass}`}>{scanState}</span>
            </div>
            <div className="port-filter-grid">
              <Field label="状态">
                <select value={status} onChange={(event) => setStatus(event.target.value as PortFilterValue<PortStatus>)}>
                  {statusOptions.map((item) => (
                    <option key={item} value={item}>
                      {item === "ALL" ? "全部" : item}
                    </option>
                  ))}
                </select>
              </Field>
              <SwitchToggle checked={listenOnly} onChange={setListenOnly} title="仅监听" hint="隐藏已建立连接" />
              <SwitchToggle checked={localOnly} onChange={setLocalOnly} title="仅本机" hint="127.0.0.1 与 ::1" />
            </div>
          </section>
          <section className="inspector-panel">
            <div className="inspector-heading">
              <div className="inspector-title">进程摘要</div>
            </div>
            <div className="port-summary-list">
              {processSummary.length ? (
                processSummary.map((item) => (
                  <div className="port-summary-row" key={item.process}>
                    <span className="summary-name">{item.process}</span>
                    <span className="summary-value">{item.count}</span>
                  </div>
                ))
              ) : (
                <div className="port-summary-row">
                  <span className="summary-name">无匹配进程</span>
                  <span className="summary-value">0</span>
                </div>
              )}
            </div>
          </section>
          <section className="inspector-panel">
            <div className="inspector-heading">
              <div className="inspector-title">快速定位</div>
            </div>
            <div className="tiny-list">
              <div className="tiny-row">
                <span>开发服务</span>
                <code>3000 / 5173</code>
              </div>
              <div className="tiny-row">
                <span>数据库</span>
                <code>3306 / 5432</code>
              </div>
              <div className="tiny-row">
                <span>缓存</span>
                <code>6379 / 11211</code>
              </div>
              <div className="tiny-row">
                <span>系统</span>
                <code>53 / 5000</code>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </section>
  );
}
