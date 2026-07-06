import { Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Panel, SegmentButton } from "../components/Panel";
import { copyText } from "../lib/desktop";
import { usePageChrome } from "../hooks/usePageChrome";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import { decodeJwt, encodeJwt, formatUnixTime, registeredClaims, sampleJwtHeader, sampleJwtPayload, verifyJwt, type JwtAlg } from "../lib/tools/jwt";

type JwtMode = "decode" | "encode";

export function JwtPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [mode, setMode] = useState<JwtMode>("decode");
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("devforge-secret");
  const [alg, setAlg] = useState<JwtAlg>("HS256");
  const [header, setHeader] = useState(JSON.stringify(sampleJwtHeader, null, 2));
  const [payload, setPayload] = useState(JSON.stringify(sampleJwtPayload, null, 2));
  const [encoded, setEncoded] = useState("");
  const [verifyState, setVerifyState] = useState("待校验");
  const [encodeStatus, setEncodeStatus] = useState("Ready");

  const decoded = useMemo(() => decodeJwt(token), [token]);
  const encodedDecoded = useMemo(() => decodeJwt(encoded), [encoded]);
  const activeDecoded = mode === "encode" && encodedDecoded.ok ? encodedDecoded : decoded;
  const metricStatus = mode === "encode" ? encodeStatus : decoded.ok ? "Decoded" : token ? "Error" : "Ready";
  const metricExpiry =
    activeDecoded.ok && activeDecoded.payload.exp
      ? formatUnixTime(activeDecoded.payload.exp)
      : "-";
  const metrics = [
    { label: "算法", value: String(activeDecoded.header.alg ?? alg) },
    { label: "过期", value: metricExpiry, compact: true },
    { label: "状态", value: metricStatus, compact: true }
  ];
  usePageChrome({
    tool: toolById.jwt,
    kicker: "Header、Payload 与签名校验/生成",
    metrics
  });

  useEffect(() => {
    void encodeJwt(header, payload, alg, secret)
      .then((next) => {
        setToken(next);
        setEncoded(next);
        setEncodeStatus("Encoded");
      })
      .catch(() => undefined);
  }, []);

  const persist = async (action: string, status: UsageDraft["status"] = decoded.ok ? "ok" : "error") => {
    await recordUsage({
      toolId: "jwt",
      action,
      input: decoded.ok ? `${decoded.parts[0]}.${decoded.parts[1]}.<signature>` : token,
      output: decoded.ok ? JSON.stringify({ alg: decoded.header.alg, sub: decoded.payload.sub }) : decoded.error,
      status
    });
  };

  const runEncode = async () => {
    try {
      const next = await encodeJwt(header, payload, alg, secret);
      setEncoded(next);
      setToken(next);
      setEncodeStatus("Encoded");
      await recordUsage({ toolId: "jwt", action: "encode", input: "header.payload.<secret>", output: "jwt token generated", status: "ok" });
    } catch (error) {
      setEncoded(error instanceof Error ? error.message : "生成失败");
      setEncodeStatus("Error");
      await recordUsage({ toolId: "jwt", action: "encode", input: "invalid json", output: "error", status: "error" });
    }
  };

  const runVerify = async () => {
    const result = await verifyJwt(token, secret);
    setVerifyState(result.supported ? (result.ok ? "签名有效" : "签名不匹配") : "不支持");
    await persist("verify", result.ok ? "ok" : result.supported ? "error" : "warn");
  };

  const loadSample = async () => {
    const nextHeader = JSON.stringify(sampleJwtHeader, null, 2);
    const nextPayload = JSON.stringify(sampleJwtPayload, null, 2);
    setHeader(nextHeader);
    setPayload(nextPayload);
    setSecret("devforge-secret");
    setAlg("HS256");
    const next = await encodeJwt(nextHeader, nextPayload, "HS256", "devforge-secret");
    setEncoded(next);
    setEncodeStatus(mode === "encode" ? "Encoded" : "Ready");
    if (mode === "decode") setToken(next);
  };

  const clearCurrentMode = () => {
    if (mode === "decode") {
      setToken("");
      setVerifyState("待校验");
      return;
    }
    setHeader("");
    setPayload("");
    setEncoded("");
    setEncodeStatus("Ready");
  };

  return (
    <section className="tool-shell jwt-tool-shell" data-mode={mode}>
      <div className="mode-strip">
        <div className="segmented-control">
          <SegmentButton active={mode === "decode"} onClick={() => setMode("decode")}>
            解码
          </SegmentButton>
          <SegmentButton active={mode === "encode"} onClick={() => setMode("encode")}>
            编码
          </SegmentButton>
        </div>
        <div className="mode-tools">
          <Button onClick={() => void loadSample()}>{mode === "encode" ? "示例 JSON" : "示例 Token"}</Button>
          <Button onClick={clearCurrentMode}>清空</Button>
          <Button variant="primary" onClick={() => void copyText(mode === "encode" ? encoded : token).then(() => persist("copy"))}>
            <Copy size={14} /> {mode === "encode" ? "复制结果" : "复制 Token"}
          </Button>
        </div>
      </div>
      <div className="single-workbench">
        <div className="single-main">
          <Panel title="JWT Token" actions={<Button onClick={() => void persist("decode")}>解码</Button>} className="editor-panel jwt-mode-panel jwt-decode-panel">
            <div className="editor-body jwt-token-body">
              <textarea id="jwtInput" className="editor-textarea" value={token} onChange={(event) => setToken(event.target.value)} spellCheck={false} />
            </div>
            <div className="editor-footer">
              <span>{decoded.ok ? `${decoded.parts.length} 段 · Base64URL` : decoded.error}</span>
              <span>{decoded.ok ? "Decoded" : "Error"}</span>
            </div>
          </Panel>

          <section className="jwt-stack jwt-mode-panel jwt-decode-panel">
            <section className="compact-panel">
              <div className="compact-panel-title">Header</div>
              <pre className="code-block jwt-code">{decoded.ok ? JSON.stringify(decoded.header, null, 2) : ""}</pre>
            </section>
            <section className="compact-panel">
              <div className="compact-panel-title">Payload</div>
              <pre className="code-block jwt-code">{decoded.ok ? JSON.stringify(decoded.payload, null, 2) : ""}</pre>
            </section>
            <section className="compact-panel">
              <div className="compact-panel-title">JWT Signature Verification</div>
              <div className="jwt-signature-panel">
                <pre className="code-block jwt-code is-muted">{decoded.ok ? decoded.signature : decoded.error}</pre>
                <div className="jwt-verify-box">
                  <div className="field">
                    <label>Secret / Shared Key</label>
                    <div className="jwt-secret-row">
                      <input className="inline-input" type="password" value={secret} onChange={(event) => setSecret(event.target.value)} />
                      <Button variant="primary" onClick={() => void runVerify()}>
                        校验
                      </Button>
                    </div>
                  </div>
                  <div className="jwt-verify-status">
                    <span className={`health-badge ${verifyState === "签名有效" ? "" : verifyState === "签名不匹配" ? "error" : "warning"}`}>{verifyState}</span>
                    <div className="jwt-note">支持 HS256、HS384、HS512；RS/ES 算法仅解码展示。</div>
                  </div>
                </div>
              </div>
            </section>
          </section>

          <Panel
            title="编码 JWT"
            actions={
              <>
                <select
                  value={alg}
                  onChange={(event) => {
                    const nextAlg = event.target.value as JwtAlg;
                    setAlg(nextAlg);
                    try {
                      const nextHeader = JSON.parse(header || "{}") as Record<string, unknown>;
                      nextHeader.alg = nextAlg;
                      nextHeader.typ ??= "JWT";
                      setHeader(JSON.stringify(nextHeader, null, 2));
                    } catch {
                      // Keep the user's invalid JSON untouched while they edit.
                    }
                  }}
                  aria-label="签名算法"
                >
                  <option value="HS256">HS256</option>
                  <option value="HS384">HS384</option>
                  <option value="HS512">HS512</option>
                  <option value="none">none</option>
                </select>
                <Button variant="primary" onClick={() => void runEncode()}>
                  生成
                </Button>
              </>
            }
            className="editor-panel jwt-mode-panel jwt-encode-panel"
          >
            <div className="jwt-encode-content">
              <div className="jwt-encode-grid">
                <section className="panel editor-panel">
                  <div className="panel-topbar">
                    <div className="panel-title">Header JSON</div>
                  </div>
                  <div className="editor-body">
                    <textarea className="editor-textarea" value={header} onChange={(event) => setHeader(event.target.value)} spellCheck={false} />
                  </div>
                </section>
                <section className="panel editor-panel">
                  <div className="panel-topbar">
                    <div className="panel-title">Payload JSON</div>
                  </div>
                  <div className="editor-body">
                    <textarea className="editor-textarea" value={payload} onChange={(event) => setPayload(event.target.value)} spellCheck={false} />
                  </div>
                </section>
              </div>
              <div className="form-grid jwt-encode-form-grid">
                <div className="field">
                  <label>Secret / Shared Key</label>
                  <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} />
                </div>
                <div className="field jwt-output-field">
                  <label>生成结果</label>
                  <pre className={`code-block jwt-code jwt-output ${encoded ? "" : "is-empty"}`}>{encoded}</pre>
                </div>
              </div>
            </div>
            <div className="editor-footer">
              <span>{encoded ? `${encoded.length} chars` : "等待生成"}</span>
              <span>{encodeStatus}</span>
            </div>
          </Panel>
        </div>

        <aside className="side-stack">
          <Panel title="Registered Claims">
            <div className="tiny-list">
              {registeredClaims(decoded.payload).map(([label, value]) => (
                <div className="tiny-row" key={label}>
                  <span>{label}</span>
                  <code>{String(value)}</code>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Token 分段">
            <div className="tiny-list">
              <div className="tiny-row">
                <span>Header</span>
                <code>{decoded.parts[0]?.length ?? 0} chars</code>
              </div>
              <div className="tiny-row">
                <span>Payload</span>
                <code>{decoded.parts[1]?.length ?? 0} chars</code>
              </div>
              <div className="tiny-row">
                <span>Signature</span>
                <code>{decoded.parts[2]?.length ?? 0} chars</code>
              </div>
            </div>
          </Panel>
        </aside>
      </div>
    </section>
  );
}
