import { Copy, Download, Fingerprint, KeyRound, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Field, Panel, SegmentButton } from "../components/Panel";
import { usePageChrome } from "../hooks/usePageChrome";
import { copyText, saveTextFile } from "../lib/desktop";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import {
  clampRsaBits,
  generateSshKeyPair,
  updateSshPublicKeyComment,
  type EcdsaCurve,
  type GeneratedSshKeyPair,
  type SshKeyAlgorithm
} from "../lib/tools/ssh";

const defaultComment = "devforge@local";
const curveLabels: Record<EcdsaCurve, string> = {
  "P-256": "nistp256",
  "P-384": "nistp384",
  "P-521": "nistp521"
};

function keyPreview(value: string, max = 220): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function fileStem(comment: string): string {
  return comment
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "devforge";
}

export function SshKeyPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [algorithm, setAlgorithm] = useState<SshKeyAlgorithm>("rsa");
  const [rsaBits, setRsaBits] = useState(4096);
  const [curve, setCurve] = useState<EcdsaCurve>("P-256");
  const [comment, setComment] = useState(defaultComment);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [keyPair, setKeyPair] = useState<GeneratedSshKeyPair | null>(null);
  const [status, setStatus] = useState<"generating" | "ready" | "error">("generating");
  const [statusMessage, setStatusMessage] = useState("正在生成");
  const [copiedTarget, setCopiedTarget] = useState<"public" | "private" | "fingerprint" | null>(null);
  const [copyAllLabel, setCopyAllLabel] = useState("复制全部");
  const [saveLabel, setSaveLabel] = useState("保存私钥");

  useEffect(() => {
    let cancelled = false;
    setStatus("generating");
    setStatusMessage("正在生成");

    void generateSshKeyPair({ algorithm, rsaBits, curve, comment })
      .then((nextKeyPair) => {
        if (cancelled) return;
        setKeyPair(nextKeyPair);
        setStatus("ready");
        setStatusMessage("Ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setStatusMessage(error instanceof Error ? error.message : "生成失败");
      });

    return () => {
      cancelled = true;
    };
  }, [algorithm, curve, refreshSeed, rsaBits]);

  const displayedKeyPair = useMemo(() => {
    if (!keyPair) return null;
    return {
      ...keyPair,
      comment,
      publicKey: updateSshPublicKeyComment(keyPair.publicKey, comment)
    };
  }, [comment, keyPair]);

  const activeLabel = algorithm === "rsa" ? `RSA ${clampRsaBits(rsaBits)}` : `ECDSA ${curveLabels[curve]}`;
  const healthKind = status === "error" ? "error" : status === "generating" ? "warning" : "";
  const publicKey = displayedKeyPair?.publicKey ?? "";
  const privateKey = displayedKeyPair?.privateKey ?? "";
  const fingerprint = displayedKeyPair?.fingerprint ?? "";
  const combinedKeyText = [publicKey, "", privateKey, "", fingerprint].filter(Boolean).join("\n");

  usePageChrome({
    tool: toolById.ssh,
    kicker: "OpenSSH 公钥、PKCS#8 私钥与 SHA256 指纹",
    metrics: [
      { label: "算法", value: algorithm.toUpperCase() },
      { label: "强度", value: algorithm === "rsa" ? `${clampRsaBits(rsaBits)} bit` : curveLabels[curve] },
      { label: "状态", value: status === "ready" ? "Ready" : statusMessage }
    ]
  });

  const recordCopyUsage = async (action: string, statusValue: UsageDraft["status"]) => {
    await recordUsage({
      toolId: "ssh",
      action,
      input: activeLabel,
      output: displayedKeyPair ? `${displayedKeyPair.label} key pair` : "empty",
      status: statusValue
    });
  };

  const copyValue = async (value: string, target: "public" | "private" | "fingerprint" | "all") => {
    if (target === "all") {
      setCopyAllLabel("已复制");
      window.setTimeout(() => setCopyAllLabel("复制全部"), 900);
    } else {
      setCopiedTarget(target);
      window.setTimeout(() => setCopiedTarget(null), 900);
    }

    let copyStatus: UsageDraft["status"] = value ? "ok" : "warn";
    try {
      if (!value) throw new Error("empty value");
      await copyText(value);
    } catch {
      copyStatus = "warn";
    }
    await recordCopyUsage(`copy-${target}`, copyStatus);
  };

  const savePrivateKey = async () => {
    setSaveLabel("已保存");
    window.setTimeout(() => setSaveLabel("保存私钥"), 900);
    let saveStatus: UsageDraft["status"] = privateKey ? "ok" : "warn";
    try {
      if (!privateKey) throw new Error("empty value");
      const saved = await saveTextFile(`id_${algorithm}_${fileStem(comment)}`, privateKey);
      saveStatus = saved ? "ok" : "warn";
    } catch {
      saveStatus = "warn";
    }
    await recordCopyUsage("save-private-key", saveStatus);
  };

  const setAlgorithmMode = (nextAlgorithm: SshKeyAlgorithm) => {
    if (nextAlgorithm === algorithm) return;
    setAlgorithm(nextAlgorithm);
  };

  return (
    <section className="tool-shell ssh-tool-shell" role="region" aria-label="SSH 密钥对">
      <section className="mode-strip ssh-mode-strip" aria-label="密钥算法">
        <div className="segmented-control ssh-mode-control" role="tablist" aria-label="密钥算法">
          <SegmentButton active={algorithm === "rsa"} onClick={() => setAlgorithmMode("rsa")} role="tab" aria-selected={algorithm === "rsa"}>
            RSA
          </SegmentButton>
          <SegmentButton active={algorithm === "ecdsa"} onClick={() => setAlgorithmMode("ecdsa")} role="tab" aria-selected={algorithm === "ecdsa"}>
            ECDSA
          </SegmentButton>
        </div>
        <div className="mode-tools">
          <span className="format-badge">算法 {activeLabel}</span>
          <span className={`health-badge ${healthKind}`}>{statusMessage}</span>
          <Button onClick={() => setRefreshSeed((seed) => seed + 1)}>
            <RefreshCw size={14} /> 重新生成
          </Button>
          <Button className="ssh-copy-all" variant="primary" onClick={() => void copyValue(combinedKeyText, "all")}>
            {copyAllLabel}
          </Button>
        </div>
      </section>

      <section className="ssh-workbench">
        <div className="ssh-main">
          <section className="editor-panel ssh-result-panel">
            <div className="panel-topbar">
              <div className="panel-title">
                <KeyRound size={15} /> SSH 密钥对
              </div>
              <div className="panel-actions">
                <span className={`health-badge ${healthKind}`}>{statusMessage}</span>
              </div>
            </div>

            <div className="ssh-key-grid">
              <section className="ssh-key-block" aria-label="OpenSSH 公钥">
                <div className="ssh-key-heading">
                  <div>
                    <strong>OpenSSH 公钥</strong>
                    <span>可追加到 authorized_keys</span>
                  </div>
                  <Button className="ssh-copy-btn" onClick={() => void copyValue(publicKey, "public")}>
                    {copiedTarget === "public" ? "已复制" : "复制"}
                  </Button>
                </div>
                <pre>{publicKey || "正在生成公钥..."}</pre>
              </section>

              <section className="ssh-key-block private" aria-label="PKCS#8 私钥">
                <div className="ssh-key-heading">
                  <div>
                    <strong>PKCS#8 私钥</strong>
                    <span>未加密，请妥善保存</span>
                  </div>
                  <Button className="ssh-copy-btn" onClick={() => void copyValue(privateKey, "private")}>
                    {copiedTarget === "private" ? "已复制" : "复制"}
                  </Button>
                </div>
                <pre>{privateKey || "正在生成私钥..."}</pre>
              </section>
            </div>

            <div className="editor-footer">
              <span>{displayedKeyPair ? `${displayedKeyPair.label} · ${displayedKeyPair.comment}` : "Web Crypto"}</span>
              <span>{status === "ready" ? "本地生成" : statusMessage}</span>
            </div>
          </section>
        </div>

        <aside className="side-stack ssh-side-stack">
          <section className="inspector-panel ssh-settings-panel">
            <div className="inspector-heading">
              <div className="inspector-title">生成设置</div>
              <span className={`health-badge ${healthKind}`}>{statusMessage}</span>
            </div>
            <div className="ssh-settings-grid">
              <Field label="注释">
                <input aria-label="密钥注释" onChange={(event) => setComment(event.target.value)} spellCheck={false} type="text" value={comment} />
              </Field>
              {algorithm === "rsa" ? (
                <Field label="RSA 长度">
                  <div className="ssh-choice-grid">
                    {[2048, 3072, 4096].map((bits) => (
                      <button className={rsaBits === bits ? "active" : ""} key={bits} onClick={() => setRsaBits(bits)} type="button">
                        {bits}
                      </button>
                    ))}
                  </div>
                </Field>
              ) : (
                <Field label="ECDSA 曲线">
                  <div className="ssh-choice-grid">
                    {(["P-256", "P-384", "P-521"] as EcdsaCurve[]).map((item) => (
                      <button className={curve === item ? "active" : ""} key={item} onClick={() => setCurve(item)} type="button">
                        {curveLabels[item]}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            </div>
          </section>

          <Panel
            title={
              <>
                <Fingerprint size={15} /> 指纹
              </>
            }
          >
            <div className="ssh-fingerprint-box">
              <code>{fingerprint || "SHA256:..."}</code>
              <Button className="ssh-copy-btn" onClick={() => void copyValue(fingerprint, "fingerprint")}>
                {copiedTarget === "fingerprint" ? "已复制" : "复制"}
              </Button>
            </div>
            <div className="tiny-list">
              {(displayedKeyPair?.details ?? [
                { label: "算法", value: algorithm.toUpperCase() },
                { label: "随机源", value: "Web Crypto" },
                { label: "格式", value: "OpenSSH" }
              ]).map((item) => (
                <div className="tiny-row" key={item.label}>
                  <span>{item.label}</span>
                  <code>{item.value}</code>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title={
              <>
                <ShieldAlert size={15} /> 导出
              </>
            }
          >
            <pre className="ssh-preview">{keyPreview(publicKey)}</pre>
            <div className="button-grid">
              <Button className="ssh-save-btn" onClick={() => void savePrivateKey()}>
                <Download size={14} /> {saveLabel}
              </Button>
              <Button className="ssh-copy-all secondary" onClick={() => void copyValue(combinedKeyText, "all")}>
                <Copy size={14} /> {copyAllLabel}
              </Button>
            </div>
          </Panel>
        </aside>
      </section>
    </section>
  );
}
