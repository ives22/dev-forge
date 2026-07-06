import { Copy, Play, Search, Server } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Panel, SegmentButton } from "../components/Panel";
import { copyText, lookupDns } from "../lib/desktop";
import { usePageChrome } from "../hooks/usePageChrome";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import {
  dnsMetrics,
  dnsRecordTypes,
  normalizeDnsDomain,
  recordsToText,
  type DnsLookupResult,
  type DnsRecordType,
  type DnsStatus
} from "../lib/tools/dns";

function statusLabel(status: DnsStatus, result: DnsLookupResult | null) {
  if (status === "loading") return "查询中";
  if (status === "error") return "错误";
  if (status === "empty") return "无记录";
  if (status === "idle" || !result) return "待查询";
  if (result.source === "doh") return "DoH";
  return "OK";
}

function statusClass(status: DnsStatus, result: DnsLookupResult | null) {
  if (status === "error") return "error";
  if (status === "idle" || status === "empty" || result?.source === "doh") return "warning";
  return "";
}

export function DnsPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [domain, setDomain] = useState("devforge.app");
  const [recordType, setRecordType] = useState<DnsRecordType>("A");
  const [status, setStatus] = useState<DnsStatus>("idle");
  const [result, setResult] = useState<DnsLookupResult | null>(null);
  const [error, setError] = useState("");
  const [copyLabel, setCopyLabel] = useState("复制");

  const metrics = useMemo(() => dnsMetrics(result, status), [result, status]);
  const statusMetrics = [
    { label: "记录", value: metrics.count },
    { label: "TTL", value: metrics.ttl },
    { label: "耗时", value: metrics.elapsed }
  ];
  const activeDomain = normalizeDnsDomain(domain);
  const footerStatus = result?.source === "doh" ? "DNS over HTTPS" : "App Native DNS";
  const resolverRows = [
    { name: "执行方式", value: result?.source === "doh" ? "浏览器 DoH" : "App 内置 DNS" },
    { name: "解析器", value: result?.resolver ?? "系统默认 DNS" },
    { name: "状态", value: result?.statusText ?? "等待查询" }
  ];

  usePageChrome({
    tool: toolById.dns,
    kicker: "A、AAAA、CNAME、MX 与 TXT 解析",
    metrics: statusMetrics
  });

  const runLookup = async (nextType = recordType, nextDomain = domain) => {
    const normalizedDomain = normalizeDnsDomain(nextDomain);
    setStatus("loading");
    setError("");
    try {
      const nextResult = await lookupDns(normalizedDomain, nextType);
      setResult(nextResult);
      setStatus(nextResult.records.length ? "ready" : "empty");
      await recordUsage({
        toolId: "dns",
        action: "lookup",
        input: `${normalizedDomain} ${nextType}`,
        output: recordsToText(nextResult.records),
        status: nextResult.records.length ? "ok" : "warn"
      });
    } catch (lookupError) {
      const message = lookupError instanceof Error ? lookupError.message : "DNS 查询失败";
      setError(message);
      setStatus("error");
      await recordUsage({
        toolId: "dns",
        action: "lookup",
        input: `${normalizedDomain} ${nextType}`,
        output: message,
        status: "error"
      });
    }
  };

  const loadSample = () => {
    const sampleDomain = "api.devforge.app";
    const sampleType = "A";
    setDomain(sampleDomain);
    setRecordType(sampleType);
    setError("");
    void runLookup(sampleType, sampleDomain);
  };

  const copyRows = async () => {
    if (!result) return;
    await copyText(recordsToText(result.records));
    setCopyLabel("已复制");
    window.setTimeout(() => setCopyLabel("复制"), 900);
    await recordUsage({
      toolId: "dns",
      action: "copy",
      input: `${result.domain} ${result.type}`,
      output: recordsToText(result.records),
      status: result.records.length ? "ok" : "warn"
    });
  };

  const pickRecordType = (nextType: DnsRecordType) => {
    setRecordType(nextType);
    void runLookup(nextType);
  };

  return (
    <section className="tool-shell" aria-label="DNS 查询工具">
      <section className="mode-strip" aria-label="DNS 查询操作">
        <label className="port-search dns-search">
          <Search size={15} aria-hidden="true" />
          <input value={domain} onChange={(event) => setDomain(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void runLookup()} placeholder="输入域名，例如 devforge.app" />
        </label>
        <div className="segmented-control dns-type-control" aria-label="DNS 记录类型">
          {dnsRecordTypes.map((type) => (
            <SegmentButton key={type} active={recordType === type} onClick={() => pickRecordType(type)}>
              {type}
            </SegmentButton>
          ))}
        </div>
        <div className="mode-tools">
          <Button onClick={loadSample}>示例</Button>
          <Button onClick={() => void copyRows()}>
           {copyLabel}
          </Button>
          <Button variant="primary" onClick={() => void runLookup()}>
            查询
          </Button>
        </div>
      </section>

      <section className="dns-workbench">
        <div className="single-main">
          <section className="editor-panel port-table-panel dns-result-panel">
            <div className="panel-topbar">
              <div className="panel-title">解析结果</div>
              <div className="panel-actions">
                <span className="format-badge">{result?.records.length ?? 0} 项</span>
              </div>
            </div>
            <div className="port-table-shell dns-table-shell">
              <table className="port-table dns-table">
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>主机</th>
                    <th>值</th>
                    <th>TTL</th>
                    <th>来源</th>
                  </tr>
                </thead>
                <tbody>
                  {status === "error" ? (
                    <tr>
                      <td className="empty-row error-text" colSpan={5}>
                        {error}
                      </td>
                    </tr>
                  ) : result?.records.length ? (
                    result.records.map((record, index) => (
                      <tr key={`${record.type}-${record.host}-${record.value}-${index}`}>
                        <td>
                          <span className="protocol-badge tcp">{record.type}</span>
                        </td>
                        <td className="mono-cell">{record.host}</td>
                        <td className="mono-cell dns-value-cell">
                          {record.priority ? <span className="dns-priority">prio {record.priority}</span> : null}
                          {record.value}
                        </td>
                        <td className="mono-cell">{record.ttl ?? "-"}</td>
                        <td>{record.source}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="empty-row" colSpan={5}>
                        {status === "loading"
                          ? "正在查询 DNS 记录..."
                          : status === "idle"
                            ? "输入域名后点击查询，结果会显示在这里。"
                            : `未找到 ${activeDomain} 的 ${recordType} 记录`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="editor-footer">
              <span>
                {result ? `${result.resolver} · ${result.type} · ${result.domain}` : `${activeDomain} · ${recordType}`}
              </span>
              <span>{footerStatus}</span>
            </div>
          </section>
        </div>

        <aside className="side-stack">
          <section className="inspector-panel dns-trace-panel">
            <div className="inspector-heading">
              <div className="inspector-title">解析链路</div>
              <span className={`health-badge ${statusClass(status, result)}`}>{statusLabel(status, result)}</span>
            </div>
            <div className="proto-list">
              {result?.trace.length ? (
                result.trace.map((step) => (
                  <div className="proto-list-row" key={`${step.name}-${step.value}`}>
                    <span className="proto-name">{step.name}</span>
                    <span className="proto-value">{step.value}</span>
                  </div>
                ))
              ) : (
                <div className="proto-list-row">
                  <span className="proto-name">等待查询</span>
                  <span className="proto-value">-</span>
                </div>
              )}
            </div>
          </section>
          <Panel
            title={
              <>
                <Server size={16} /> 服务器
              </>
            }
            className="dns-resolver-panel"
          >
            <div className="tiny-list">
              {resolverRows.map((resolver) => (
                <div className="tiny-row" key={resolver.name}>
                  <span>{resolver.name}</span>
                  <code>{resolver.value}</code>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="查询摘要" className="dns-summary-panel">
            <div className="tiny-list">
              <div className="tiny-row">
                <span>当前域名</span>
                <code>{activeDomain}</code>
              </div>
              <div className="tiny-row">
                <span>记录类型</span>
                <code>{recordType}</code>
              </div>
              <div className="tiny-row">
                <span>结果来源</span>
                <code>{result ? (result.source === "doh" ? "DoH" : "系统") : "-"}</code>
              </div>
            </div>
          </Panel>
        </aside>
      </section>
    </section>
  );
}
