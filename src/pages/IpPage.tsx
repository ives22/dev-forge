import { Calculator, Copy, Globe2, LocateFixed, Network, RefreshCw, ShieldCheck, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Field, Panel, SegmentButton } from "../components/Panel";
import { usePageChrome } from "../hooks/usePageChrome";
import { copyText, getLocalNetworkIp } from "../lib/desktop";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import {
  calculateSubnet,
  fallbackPublicIpInfo,
  formatNumber,
  localConnectionTypeLabel,
  localNetworkIpRows,
  lookupPublicIp,
  publicIpRows,
  subnetRows,
  type IpLookupStatus,
  type LocalNetworkIpInfo,
  type PublicIpInfo,
  type SubnetCalculation,
  unavailableLocalNetworkIpInfo
} from "../lib/tools/ip";

type IpMode = "lookup" | "calc";

function statusLabel(status: IpLookupStatus) {
  if (status === "loading") return "查询中";
  if (status === "sample") return "示例";
  if (status === "error") return "错误";
  if (status === "ready") return "完成";
  return "待查询";
}

function statusClass(status: IpLookupStatus) {
  if (status === "error") return "error";
  if (status === "sample" || status === "idle") return "warning";
  return "";
}

function locationText(info: PublicIpInfo) {
  if (info.latitude === null || info.longitude === null) return "--";
  return `${info.latitude.toFixed(4)}, ${info.longitude.toFixed(4)}`;
}

function copyableRows(rows: Array<{ name: string; value: string; description: string }>) {
  return rows.map((row) => [row.name, row.value, row.description].join("\t")).join("\n");
}

function BinaryBits({ bits, prefix }: { bits: string; prefix: number }) {
  let bitIndex = 0;
  return (
    <>
      {bits.split("").map((char, index) => {
        if (char === ".") return <span key={index}>.</span>;
        const current = bitIndex++;
        return (
          <span className={current < prefix ? "network" : "host"} key={index}>
            {char}
          </span>
        );
      })}
    </>
  );
}

export function IpPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [mode, setMode] = useState<IpMode>("lookup");
  const [lookupStatus, setLookupStatus] = useState<IpLookupStatus>("idle");
  const [publicInfo, setPublicInfo] = useState<PublicIpInfo>({ ...fallbackPublicIpInfo, updatedAt: "--" });
  const [localInfo, setLocalInfo] = useState<LocalNetworkIpInfo>({ ...unavailableLocalNetworkIpInfo, updatedAt: "--" });
  const [copyIpLabel, setCopyIpLabel] = useState("复制 IP");
  const [copyRowsLabel, setCopyRowsLabel] = useState("复制");
  const [calcIp, setCalcIp] = useState("192.168.10.34");
  const [calcMask, setCalcMask] = useState("24");
  const [calcError, setCalcError] = useState("");
  const [calcResult, setCalcResult] = useState<SubnetCalculation>(() => calculateSubnet("192.168.10.34", "24"));

  const publicRows = useMemo(() => publicIpRows(publicInfo), [publicInfo]);
  const localRows = useMemo(() => localNetworkIpRows(localInfo), [localInfo]);
  const lookupRows = useMemo(() => [...publicRows, ...localRows], [publicRows, localRows]);
  const resultRows = useMemo(() => subnetRows(calcResult), [calcResult]);
  const lookupMetrics = [
    { label: "出口", value: publicInfo.type },
    { label: "本机", value: localInfo.connectionType === "unavailable" ? "--" : localConnectionTypeLabel(localInfo.connectionType) },
    { label: "来源", value: publicInfo.source, compact: true },
    { label: "状态", value: statusLabel(lookupStatus) }
  ];
  const calcMetrics = [
    { label: "CIDR", value: `/${calcResult.prefix}` },
    { label: "地址", value: formatNumber(calcResult.totalAddresses) },
    { label: "状态", value: calcError ? "Invalid" : "Valid" }
  ];

  usePageChrome({
    tool: toolById.ip,
    kicker: "公网出口 IP、地理信息与 IPv4 子网计算",
    metrics: mode === "lookup" ? lookupMetrics : calcMetrics
  });

  const runLookup = async () => {
    setLookupStatus("loading");
    const [result, localResult] = await Promise.all([
      lookupPublicIp(),
      getLocalNetworkIp().catch(() => ({
        ...unavailableLocalNetworkIpInfo,
        source: "system",
        statusText: "未识别"
      }))
    ]);
    setPublicInfo(result.info);
    setLocalInfo(localResult);
    setLookupStatus(result.fallback ? "sample" : "ready");
    await recordUsage({
      toolId: "ip",
      action: "lookup",
      input: "public-ip+local-ip",
      output: `${result.info.ip}\t${localResult.ip}\t${localResult.interfaceName}`,
      status: result.fallback || localResult.connectionType === "unavailable" ? "warn" : "ok"
    });
  };

  useEffect(() => {
    void runLookup();
  }, []);

  const runCalc = async () => {
    try {
      const next = calculateSubnet(calcIp, calcMask);
      setCalcResult(next);
      setCalcError("");
      await recordUsage({
        toolId: "ip",
        action: "subnet",
        input: `${calcIp}/${calcMask}`,
        output: `${next.network}\t${next.broadcast}\t${next.usableHosts}`,
        status: "ok"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "IP 网络计算失败";
      setCalcError(message);
      await recordUsage({
        toolId: "ip",
        action: "subnet",
        input: `${calcIp}/${calcMask}`,
        output: message,
        status: "error"
      });
    }
  };

  const copyIp = async () => {
    await copyText(publicInfo.ip);
    setCopyIpLabel("已复制");
    window.setTimeout(() => setCopyIpLabel("复制 IP"), 900);
  };

  const copyCurrentRows = async () => {
    const text = mode === "lookup" ? copyableRows(lookupRows) : copyableRows(resultRows);
    await copyText(text);
    setCopyRowsLabel("已复制");
    window.setTimeout(() => setCopyRowsLabel("复制"), 900);
    await recordUsage({
      toolId: "ip",
      action: "copy",
      input: mode,
      output: text,
      status: "ok"
    });
  };

  const loadCalcSample = () => {
    setCalcIp("10.24.18.129");
    setCalcMask("255.255.255.192");
    setCalcResult(calculateSubnet("10.24.18.129", "255.255.255.192"));
    setCalcError("");
  };

  const primaryAction = mode === "lookup" ? runLookup : runCalc;
  const primaryLabel = mode === "lookup" ? "重新查询" : "计算";

  return (
    <section className="tool-shell ip-tool-shell" aria-label="IP 工具">
      <section className="mode-strip ip-mode-strip" aria-label="IP 工具切换">
        <div className="segmented-control" role="tablist" aria-label="IP 工具类型">
          <SegmentButton active={mode === "lookup"} onClick={() => setMode("lookup")}>
            IP 查询
          </SegmentButton>
          <SegmentButton active={mode === "calc"} onClick={() => setMode("calc")}>
            IP 网络计算
          </SegmentButton>
        </div>
        <div className="mode-tools">
          {mode === "lookup" ? (
            <Button onClick={() => void copyIp()}>
              <Copy size={14} /> {copyIpLabel}
            </Button>
          ) : (
            <Button onClick={loadCalcSample}>示例</Button>
          )}
          <Button onClick={() => void copyCurrentRows()}>{copyRowsLabel}</Button>
          <Button variant="primary" onClick={() => void primaryAction()} disabled={mode === "lookup" && lookupStatus === "loading"}>
            {mode === "lookup" ? <RefreshCw size={14} /> : <Calculator size={14} />}
            {primaryLabel}
          </Button>
        </div>
      </section>

      {mode === "lookup" ? (
        <section className="ip-workbench">
          <div className="single-main ip-main-stack">
            <section className="panel ip-lookup-panel">
              <div className="ip-hero">
                <div className="ip-hero-copy">
                  <div className="ip-kicker">
                    <span className="pulse-ring" />
                    <span>Outbound Public IP</span>
                  </div>
                  <div className="public-ip">{lookupStatus === "loading" ? "查询中..." : publicInfo.ip}</div>
                  <div className="ip-subline">
                    <span className={`ip-tag ${lookupStatus === "sample" ? "warn" : "success"}`}>
                      {lookupStatus === "sample" ? "接口不可用，展示回退数据" : "已识别出口公网 IP"}
                    </span>
                    <span className="ip-tag">{`${publicInfo.country} / ${publicInfo.countryCode}`}</span>
                    <span className="ip-tag">{`${publicInfo.region} · ${publicInfo.city}`}</span>
                  </div>
                  <div className="ip-hero-metrics">
                    <div className="ip-metric-card">
                      <span>ISP</span>
                      <strong>{publicInfo.isp}</strong>
                    </div>
                    <div className="ip-metric-card">
                      <span>ASN</span>
                      <strong>{publicInfo.asn}</strong>
                    </div>
                    <div className="ip-metric-card">
                      <span>时区</span>
                      <strong>{publicInfo.timezone}</strong>
                    </div>
                  </div>
                </div>
                <div className="ip-map-card" aria-label="地理位置示意">
                  <div className="ip-map-route" />
                  <div className="ip-map-pin" />
                  <div className="ip-map-caption">
                    <span>{publicInfo.latitude === null ? "lat --" : `lat ${publicInfo.latitude.toFixed(4)}`}</span>
                    <span>{publicInfo.longitude === null ? "lng --" : `lng ${publicInfo.longitude.toFixed(4)}`}</span>
                  </div>
                </div>
              </div>
              <div className="ip-data-grid">
                <div className="ip-data-card">
                  <span>国家 / Country</span>
                  <strong>{publicInfo.country}</strong>
                </div>
                <div className="ip-data-card">
                  <span>省州 / Region</span>
                  <strong>{publicInfo.region}</strong>
                </div>
                <div className="ip-data-card">
                  <span>城市 / City</span>
                  <strong>{publicInfo.city}</strong>
                </div>
                <div className="ip-data-card">
                  <span>位置 / Location</span>
                  <strong>{locationText(publicInfo)}</strong>
                </div>
                <div className="ip-data-card">
                  <span>运营商 / ISP</span>
                  <strong>{publicInfo.isp}</strong>
                </div>
                <div className="ip-data-card">
                  <span>组织 / Organization</span>
                  <strong>{publicInfo.org}</strong>
                </div>
                <div className="ip-data-card">
                  <span>ASN</span>
                  <strong>{publicInfo.asn}</strong>
                </div>
                <div className="ip-data-card">
                  <span>查询时间 / Last Seen</span>
                  <strong>{publicInfo.updatedAt || "--"}</strong>
                </div>
              </div>
            </section>

            <Panel
              title={
                <>
                  {localInfo.connectionType === "wifi" ? <Wifi size={15} /> : <Network size={15} />} 本机网卡 IP
                </>
              }
              actions={<span className="format-badge">{localInfo.statusText}</span>}
              className="local-ip-panel"
            >
              <div className="local-ip-grid">
                <div className="local-ip-primary">
                  <span>Local IPv4</span>
                  <strong>{lookupStatus === "loading" ? "读取中..." : localInfo.ip}</strong>
                  <small>{localInfo.isDefaultRoute ? "Default route interface" : localInfo.statusText}</small>
                </div>
                <div className="ip-data-card">
                  <span>连接 / Connection</span>
                  <strong>{localConnectionTypeLabel(localInfo.connectionType)}</strong>
                </div>
                <div className="ip-data-card">
                  <span>网卡 / Interface</span>
                  <strong>{localInfo.interfaceName}</strong>
                </div>
                <div className="ip-data-card">
                  <span>硬件端口 / Port</span>
                  <strong>{localInfo.hardwarePort}</strong>
                </div>
              </div>
            </Panel>

            <Panel title="IP 查询结果表" actions={<span className="format-badge">{lookupRows.length} 项</span>} className="ip-table-panel">
              <div className="ip-table-shell">
                <table className="port-table ip-table">
                  <thead>
                    <tr>
                      <th>字段</th>
                      <th>值</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lookupRows.map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td className="mono-cell">{row.value}</td>
                        <td>{row.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <aside className="side-stack ip-side-stack">
            <section className="inspector-panel">
              <div className="inspector-heading">
                <div className="inspector-title">
                  <LocateFixed size={15} /> 查询链路
                </div>
                <span className={`health-badge ${statusClass(lookupStatus)}`}>{statusLabel(lookupStatus)}</span>
              </div>
              <div className="proto-list">
                <div className="proto-list-row">
                  <span className="proto-name">读取本机出口</span>
                  <span className="proto-value">{lookupStatus === "loading" ? "pending" : "ok"}</span>
                </div>
                <div className="proto-list-row">
                  <span className="proto-name">读取本机网卡</span>
                  <span className="proto-value">{lookupStatus === "loading" ? "pending" : localInfo.connectionType === "unavailable" ? "unavailable" : "ok"}</span>
                </div>
                <div className="proto-list-row">
                  <span className="proto-name">解析地理位置</span>
                  <span className="proto-value">{lookupStatus === "loading" ? "pending" : lookupStatus === "sample" ? "sample" : "ok"}</span>
                </div>
                <div className="proto-list-row">
                  <span className="proto-name">填充结果表</span>
                  <span className="proto-value">{lookupStatus === "loading" ? "pending" : "ok"}</span>
                </div>
              </div>
            </section>
            <Panel
              title={
                <>
                  <ShieldCheck size={15} /> 隐私提示
                </>
              }
            >
              <div className="tiny-list">
                <div className="tiny-row">
                  <span>公网 IP</span>
                  <code>出口 NAT</code>
                </div>
                <div className="tiny-row">
                  <span>定位精度</span>
                  <code>城市级</code>
                </div>
                <div className="tiny-row">
                  <span>数据来源</span>
                  <code>{publicInfo.source}</code>
                </div>
                <div className="tiny-row">
                  <span>本机内网</span>
                  <code>{localInfo.connectionType === "unavailable" ? "桌面端" : "不上传"}</code>
                </div>
              </div>
            </Panel>
            <Panel title="常用判断">
              <div className="tiny-list">
                <div className="tiny-row">
                  <span>私有地址</span>
                  <code>10/8 172.16/12</code>
                </div>
                <div className="tiny-row">
                  <span>回环地址</span>
                  <code>127.0.0.0/8</code>
                </div>
                <div className="tiny-row">
                  <span>链路本地</span>
                  <code>169.254/16</code>
                </div>
                <div className="tiny-row">
                  <span>文档示例</span>
                  <code>203.0.113/24</code>
                </div>
              </div>
            </Panel>
          </aside>
        </section>
      ) : (
        <section className="ip-calc-stack">
          <section className="ip-calc-toolbar" aria-label="IP 网络计算输入">
            <Field label="IP 地址">
              <input
                value={calcIp}
                onChange={(event) => setCalcIp(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void runCalc()}
                inputMode="decimal"
                autoComplete="off"
              />
            </Field>
            <Field label="掩码 / CIDR">
              <input
                value={calcMask}
                onChange={(event) => setCalcMask(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void runCalc()}
                inputMode="decimal"
                autoComplete="off"
              />
            </Field>
            <Button onClick={loadCalcSample}>示例</Button>
            <Button variant="primary" onClick={() => void runCalc()}>
              计算
            </Button>
          </section>

          <section className="ip-workbench">
            <div className="single-main ip-main-stack">
              <Panel title="网络摘要" actions={<span className="format-badge">/{calcResult.prefix}</span>} className="ip-summary-panel">
                <div className="ip-summary-grid">
                  <div className="ip-summary-tile">
                    <span>IP 地址</span>
                    <strong>{calcResult.ip}</strong>
                    <small>{`${calcResult.ipType} · ${calcResult.ipClass}`}</small>
                  </div>
                  <div className="ip-summary-tile">
                    <span>网络地址</span>
                    <strong>{calcResult.network}</strong>
                    <small>Network ID</small>
                  </div>
                  <div className="ip-summary-tile">
                    <span>广播地址</span>
                    <strong>{calcResult.broadcast}</strong>
                    <small>Broadcast</small>
                  </div>
                  <div className="ip-summary-tile">
                    <span>可用主机</span>
                    <strong>{formatNumber(calcResult.usableHosts)}</strong>
                    <small>{`${calcResult.firstUsable} - ${calcResult.lastUsable}`}</small>
                  </div>
                </div>
                {calcError ? <div className="ip-error-note">{calcError}</div> : null}
              </Panel>

              <Panel title="IP / 掩码 / 网络信息" actions={<span className="format-badge">{resultRows.length} 项</span>} className="ip-table-panel">
                <div className="ip-table-shell">
                  <table className="port-table ip-table">
                    <thead>
                      <tr>
                        <th>分类</th>
                        <th>值</th>
                        <th>说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultRows.map((row) => (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td className="mono-cell">{row.value}</td>
                          <td>{row.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="二进制拆分" actions={<span className="format-badge">绿色=网络位 橙色=主机位</span>} className="ip-binary-panel">
                <div className="ip-binary-stack">
                  {calcResult.binary.map((row) => (
                    <div className="ip-binary-row" key={row.label}>
                      <span>{row.label}</span>
                      <code>
                        <BinaryBits bits={row.bits} prefix={row.prefix} />
                      </code>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <aside className="side-stack ip-side-stack">
              <section className="inspector-panel">
                <div className="inspector-heading">
                  <div className="inspector-title">
                    <Network size={15} /> 掩码信息
                  </div>
                  <span className={`health-badge ${calcError ? "warning" : ""}`}>{calcError ? "Invalid" : "Valid"}</span>
                </div>
                <div className="proto-list">
                  <div className="proto-list-row">
                    <span className="proto-name">Prefix</span>
                    <span className="proto-value">/{calcResult.prefix}</span>
                  </div>
                  <div className="proto-list-row">
                    <span className="proto-name">Mask</span>
                    <span className="proto-value">{calcResult.mask}</span>
                  </div>
                  <div className="proto-list-row">
                    <span className="proto-name">Wildcard</span>
                    <span className="proto-value">{calcResult.wildcard}</span>
                  </div>
                  <div className="proto-list-row">
                    <span className="proto-name">Block Size</span>
                    <span className="proto-value">{calcResult.blockSize}</span>
                  </div>
                </div>
              </section>
              <Panel title="网络容量">
                <div className="tiny-list">
                  <div className="tiny-row">
                    <span>Total</span>
                    <code>{formatNumber(calcResult.totalAddresses)}</code>
                  </div>
                  <div className="tiny-row">
                    <span>Usable</span>
                    <code>{formatNumber(calcResult.usableHosts)}</code>
                  </div>
                  <div className="tiny-row">
                    <span>First</span>
                    <code>{calcResult.firstUsable}</code>
                  </div>
                  <div className="tiny-row">
                    <span>Last</span>
                    <code>{calcResult.lastUsable}</code>
                  </div>
                </div>
              </Panel>
              <Panel title="CIDR 速查">
                <div className="tiny-list">
                  <div className="tiny-row">
                    <span>/24</span>
                    <code>255.255.255.0</code>
                  </div>
                  <div className="tiny-row">
                    <span>/25</span>
                    <code>255.255.255.128</code>
                  </div>
                  <div className="tiny-row">
                    <span>/26</span>
                    <code>255.255.255.192</code>
                  </div>
                  <div className="tiny-row">
                    <span>/30</span>
                    <code>255.255.255.252</code>
                  </div>
                </div>
              </Panel>
            </aside>
          </section>
        </section>
      )}
    </section>
  );
}
