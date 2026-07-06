import { Copy, Download, Lock, Pencil, Plus, QrCode, ScanLine, Search, ShieldCheck, Trash2, Unlock, Upload, X } from "lucide-react";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Field, Panel } from "../components/Panel";
import { usePageChrome } from "../hooks/usePageChrome";
import { captureScreenSelection, copyText, saveTextFile } from "../lib/desktop";
import {
  createAuthenticatorVault,
  deleteAuthenticatorAccount,
  getAuthenticatorVaultMeta,
  listAuthenticatorAccounts,
  resetAuthenticatorVault,
  saveAuthenticatorAccount,
  touchAuthenticatorAccount,
  unlockAuthenticatorVault,
  type AuthenticatorAccount
} from "../lib/storage";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import {
  defaultTotpAccount,
  extractOtpAuthUrisFromText,
  formatTotpCode,
  generateTotpCode,
  normalizeTotpPayload,
  parseOtpAuthUri,
  remainingTotpSeconds,
  totpPayloadToOtpAuthUri,
  type TotpAccountPayload,
  type TotpAlgorithm
} from "../lib/tools/authenticator";

type VaultStatus = "checking" | "empty" | "locked" | "unlocked";
type FormMode = "manual" | "uri";
type FormState = TotpAccountPayload & { uri: string };
type DialogState = { type: "delete"; account: AuthenticatorAccount } | { type: "qr"; account: AuthenticatorAccount } | { type: "edit"; account: AuthenticatorAccount } | null;

const initialFormState: FormState = {
  issuer: "",
  accountName: "",
  secret: "",
  algorithm: defaultTotpAccount.algorithm,
  digits: defaultTotpAccount.digits,
  period: defaultTotpAccount.period,
  uri: ""
};

function statusText(status: VaultStatus): string {
  if (status === "checking") return "检查中";
  if (status === "empty") return "未创建";
  if (status === "locked") return "已锁定";
  return "已解锁";
}

function strongestPeriod(accounts: AuthenticatorAccount[]): 15 | 30 | 60 {
  return accounts[0]?.payload.period ?? 30;
}

function codeClass(remaining: number): string {
  if (remaining <= 5) return "danger";
  if (remaining <= 10) return "warning";
  return "";
}

async function readQrFromImageSource(src: string, cleanup?: () => void): Promise<string> {
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("无法读取二维码图片"));
    });
    image.src = src;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前环境无法解析图片");
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const qr = jsQR(imageData.data, imageData.width, imageData.height);
    if (!qr?.data) throw new Error("未识别到二维码");
    return qr.data;
  } finally {
    cleanup?.();
  }
}

function accountKey(payloadInput: TotpAccountPayload): string {
  const payload = normalizeTotpPayload(payloadInput);
  return `${payload.issuer}\u0000${payload.accountName}\u0000${payload.secret}`;
}

function backupFileName(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `devforge-2fa-backup-${year}${month}${day}-${hours}${minutes}.txt`;
}

export function AuthenticatorPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [status, setStatus] = useState<VaultStatus>("checking");
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accounts, setAccounts] = useState<AuthenticatorAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [formMode, setFormMode] = useState<FormMode>("manual");
  const [form, setForm] = useState<FormState>(initialFormState);
  const [message, setMessage] = useState("Ready");
  const [now, setNow] = useState(Date.now());
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [copyTarget, setCopyTarget] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [exportConfirm, setExportConfirm] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [editForm, setEditForm] = useState({ issuer: "", accountName: "" });
  const [qrDataUrl, setQrDataUrl] = useState("");
  const backupInputRef = useRef<HTMLInputElement>(null);
  const copyResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAuthenticatorVaultMeta().then((meta) => {
      if (!cancelled) setStatus((current) => (current === "checking" ? (meta ? "locked" : "empty") : current));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) window.clearTimeout(copyResetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (status !== "unlocked") setExportConfirm(false);
  }, [status]);

  useEffect(() => {
    if (status !== "unlocked") {
      setDialog(null);
      setQrDataUrl("");
    }
  }, [status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDialog(null);
        setQrDataUrl("");
      }
    };
    if (dialog) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog]);

  useEffect(() => {
    let cancelled = false;
    if (!accounts.length) {
      setCodes({});
      return undefined;
    }
    void Promise.all(accounts.map(async (account) => [account.id, await generateTotpCode(account.payload, now)] as const)).then((nextCodes) => {
      if (!cancelled) setCodes(Object.fromEntries(nextCodes));
    });
    return () => {
      cancelled = true;
    };
  }, [accounts, now]);

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return accounts;
    return accounts.filter((account) => `${account.payload.issuer} ${account.payload.accountName}`.toLowerCase().includes(normalizedQuery));
  }, [accounts, query]);
  const selectedAccount = accounts.find((account) => account.id === selectedId) ?? filteredAccounts[0] ?? null;
  const remaining = remainingTotpSeconds(strongestPeriod(accounts), now);

  usePageChrome({
    tool: toolById.authenticator,
    kicker: "TOTP 动态验证码与本地加密保险库",
    metrics: [
      { label: "账号", value: status === "unlocked" ? accounts.length : "-" },
      { label: "状态", value: statusText(status) },
      { label: "刷新", value: status === "unlocked" ? `${remaining}s` : "-" }
    ]
  });

  const recordSafeUsage = async (action: string, statusValue: UsageDraft["status"] = "ok") => {
    await recordUsage({ toolId: "authenticator", action, input: "2FA vault", output: "redacted", status: statusValue });
  };

  const closeDialog = () => {
    setDialog(null);
    setQrDataUrl("");
  };

  const refreshAccounts = async (key = vaultKey) => {
    if (!key) return;
    const nextAccounts = await listAuthenticatorAccounts(key);
    setAccounts(nextAccounts);
    setSelectedId((current) => current ?? nextAccounts[0]?.id ?? null);
  };

  const handleCreateVault = async () => {
    if (masterPassword.length < 8) {
      setMessage("主密码至少 8 位");
      return;
    }
    if (masterPassword !== confirmPassword) {
      setMessage("两次主密码不一致");
      return;
    }
    try {
      const key = await createAuthenticatorVault(masterPassword);
      setVaultKey(key);
      setStatus("unlocked");
      setMasterPassword("");
      setConfirmPassword("");
      setMessage("保险库已创建");
      await recordSafeUsage("unlock");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建失败");
    }
  };

  const handleUnlock = async () => {
    try {
      const key = await unlockAuthenticatorVault(masterPassword);
      setVaultKey(key);
      setStatus("unlocked");
      setMasterPassword("");
      setMessage("已解锁");
      await refreshAccounts(key);
      await recordSafeUsage("unlock");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "解锁失败");
      await recordSafeUsage("unlock", "warn");
    }
  };

  const handleLock = async () => {
    setVaultKey(null);
    setAccounts([]);
    setCodes({});
    setSelectedId(null);
    setStatus("locked");
    setMessage("已锁定");
    await recordSafeUsage("lock");
  };

  const importUris = async (uris: string[], action: "import-backup" | "scan-qr") => {
    if (!vaultKey) return;

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const seen = new Set(accounts.map((account) => accountKey(account.payload)));

    for (const uri of uris) {
      try {
        const payload = parseOtpAuthUri(uri);
        const key = accountKey(payload);
        if (seen.has(key)) {
          skipped += 1;
          continue;
        }
        await saveAuthenticatorAccount(vaultKey, payload);
        seen.add(key);
        imported += 1;
      } catch {
        failed += 1;
      }
    }

    if (imported > 0) await refreshAccounts(vaultKey);
    setExportConfirm(false);
    setMessage(`导入 ${imported} 个，跳过 ${skipped} 个，失败 ${failed} 行`);
    await recordSafeUsage(action, failed > 0 ? "warn" : "ok");
  };

  const handleSave = async (payloadInput: TotpAccountPayload, action: "add-account" | "import-uri" | "import-qr" = "add-account") => {
    if (!vaultKey) return;
    try {
      await saveAuthenticatorAccount(vaultKey, normalizeTotpPayload(payloadInput));
      await refreshAccounts(vaultKey);
      setForm(initialFormState);
      setExportConfirm(false);
      setMessage("账号已保存");
      await recordSafeUsage(action);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
      await recordSafeUsage(action, "warn");
    }
  };

  const handleSubmitForm = async () => {
    if (formMode === "uri") {
      await handleSave(parseOtpAuthUri(form.uri), "import-uri");
      return;
    }
    await handleSave(form, "add-account");
  };

  const handleImportBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const uris = extractOtpAuthUrisFromText(await file.text());
      if (!uris.length) {
        setMessage("备份文件没有可导入的 otpauth URL");
        await recordSafeUsage("import-backup", "warn");
        return;
      }
      await importUris(uris, "import-backup");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败");
      await recordSafeUsage("import-backup", "warn");
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  };

  const handleScanQr = async () => {
    if (!vaultKey) return;
    try {
      const dataUrl = await captureScreenSelection();
      if (!dataUrl) {
        setMessage("已取消截屏或当前环境不支持扫一扫");
        await recordSafeUsage("scan-qr", "warn");
        return;
      }
      const uri = await readQrFromImageSource(dataUrl);
      await importUris([uri], "scan-qr");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "扫一扫失败");
      await recordSafeUsage("scan-qr", "warn");
    }
  };

  const handleExportBackup = async () => {
    if (status !== "unlocked" || !accounts.length) return;
    if (!exportConfirm) {
      setExportConfirm(true);
      setMessage("明文备份包含 2FA 密钥，再次点击导出");
      return;
    }

    try {
      const backupText = `${accounts.map((account) => totpPayloadToOtpAuthUri(account.payload)).join("\n")}\n`;
      const saved = await saveTextFile(backupFileName(), backupText);
      setExportConfirm(false);
      setMessage(saved ? `已导出 ${accounts.length} 个账号` : "已取消导出");
      await recordSafeUsage("export-backup", saved ? "ok" : "warn");
    } catch (error) {
      setExportConfirm(false);
      setMessage(error instanceof Error ? error.message : "导出失败");
      await recordSafeUsage("export-backup", "warn");
    }
  };

  const handleCopy = async (account: AuthenticatorAccount) => {
    const code = codes[account.id];
    setCopyTarget(account.id);
    if (copyResetTimerRef.current) window.clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyTarget(null);
      copyResetTimerRef.current = null;
    }, 900);
    let copyStatus: UsageDraft["status"] = "ok";
    try {
      if (!code) throw new Error("empty code");
      await copyText(code);
      await touchAuthenticatorAccount(account.id);
      await refreshAccounts();
      setMessage("验证码已复制");
    } catch {
      copyStatus = "warn";
      setMessage("复制失败");
    }
    await recordSafeUsage("copy-code", copyStatus);
  };

  const handleOpenQrDialog = async (account: AuthenticatorAccount) => {
    setDialog({ type: "qr", account });
    setQrDataUrl("");
    try {
      const uri = totpPayloadToOtpAuthUri(account.payload);
      setQrDataUrl(await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 2, width: 240 }));
      setMessage("二维码已生成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "二维码生成失败");
      await recordSafeUsage("show-qr", "warn");
    }
  };

  const handleOpenEditDialog = (account: AuthenticatorAccount) => {
    setEditForm({
      issuer: account.payload.issuer,
      accountName: account.payload.accountName
    });
    setDialog({ type: "edit", account });
    setQrDataUrl("");
  };

  const handleSaveEdit = async (account: AuthenticatorAccount) => {
    if (!vaultKey) return;
    try {
      await saveAuthenticatorAccount(
        vaultKey,
        normalizeTotpPayload({
          ...account.payload,
          issuer: editForm.issuer,
          accountName: editForm.accountName
        }),
        account.id
      );
      await refreshAccounts(vaultKey);
      closeDialog();
      setMessage("账号已更新");
      await recordSafeUsage("edit-account");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新失败");
      await recordSafeUsage("edit-account", "warn");
    }
  };

  const handleCopyOtpAuthUri = async (account: AuthenticatorAccount) => {
    try {
      await copyText(totpPayloadToOtpAuthUri(account.payload));
      setMessage("otpauth URI 已复制");
      await recordSafeUsage("copy-otpauth-uri");
    } catch {
      setMessage("复制 otpauth URI 失败");
      await recordSafeUsage("copy-otpauth-uri", "warn");
    }
  };

  const handleDelete = async (account: AuthenticatorAccount) => {
    await deleteAuthenticatorAccount(account.id);
    await refreshAccounts();
    closeDialog();
    setMessage("账号已删除");
    await recordSafeUsage("delete-account");
  };

  const handleResetVault = async () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    await resetAuthenticatorVault();
    setStatus("empty");
    setVaultKey(null);
    setAccounts([]);
    setSelectedId(null);
    setResetConfirm(false);
    setMessage("保险库已重置");
  };

  const lockedView = status === "empty" || status === "locked" || status === "checking";

  return (
    <section className="tool-shell authenticator-tool-shell" aria-label="身份验证器">
      <section className="mode-strip authenticator-mode-strip" aria-label="身份验证器操作">
        <div className="authenticator-search">
          <Search size={14} />
          <input aria-label="搜索 2FA 账号" disabled={status !== "unlocked"} onChange={(event) => setQuery(event.target.value)} placeholder="搜索服务商或账号" value={query} />
        </div>
        <div className="mode-tools">
          <span className="format-badge">账号 {status === "unlocked" ? accounts.length : "-"}</span>
          <span className={`health-badge ${status === "unlocked" ? "" : "warning"}`}>{statusText(status)}</span>
          <span className={`format-badge ${codeClass(remaining)}`}>刷新 {status === "unlocked" ? `${remaining}s` : "-"}</span>
          <input
            accept=".txt,text/plain"
            aria-label="导入 2FA 备份文件"
            className="sr-only"
            disabled={status !== "unlocked"}
            onChange={(event) => void handleImportBackup(event.target.files?.[0])}
            ref={backupInputRef}
            type="file"
          />
          <Button className="authenticator-toolbar-btn" disabled={status !== "unlocked"} onClick={() => void handleScanQr()}>
            <ScanLine size={14} /> 扫一扫
          </Button>
          <Button className="authenticator-toolbar-btn" disabled={status !== "unlocked"} onClick={() => backupInputRef.current?.click()}>
            <Upload size={14} /> 导入备份
          </Button>
          <Button className="authenticator-toolbar-btn authenticator-export-btn" disabled={status !== "unlocked" || !accounts.length} onClick={() => void handleExportBackup()}>
            <Download size={14} /> {exportConfirm ? "确认导出" : "导出备份"}
          </Button>
          <Button className="authenticator-toolbar-btn" disabled={status !== "unlocked"} onClick={() => void handleLock()}>
            <Lock size={14} /> 锁定
          </Button>
        </div>
      </section>

      <section className="authenticator-workbench">
        <div className="single-main authenticator-main">
          <section className="editor-panel authenticator-list-panel">
            <div className="panel-topbar">
              <div className="panel-title">TOTP 账号</div>
              <div className="panel-actions">
                <span className={`health-badge ${lockedView ? "warning" : ""}`}>{message}</span>
              </div>
            </div>
            {lockedView ? (
              <div className="authenticator-lock-state" role="status">
                <div className="authenticator-lock-icon">{status === "empty" ? <ShieldCheck size={28} /> : <Lock size={28} />}</div>
                <strong>{status === "empty" ? "创建 2FA 保险库" : "保险库已锁定"}</strong>
                <span>{status === "empty" ? "使用主密码加密保存 TOTP 密钥。" : "输入主密码后才能查看账号和验证码。"}</span>
              </div>
            ) : filteredAccounts.length ? (
              <div className="authenticator-account-list" role="list" aria-label="TOTP 账号列表">
                {filteredAccounts.map((account) => {
                  const accountRemaining = remainingTotpSeconds(account.payload.period, now);
                  const code = codes[account.id];
                  const displayCode = code ?? "------";
                  return (
                    <article className={`authenticator-account-row ${selectedAccount?.id === account.id ? "active" : ""}`} key={account.id} role="listitem">
                      <button className="authenticator-account-main" onClick={() => setSelectedId(account.id)} type="button">
                        <span className="authenticator-provider">{account.payload.issuer}</span>
                        <span className="authenticator-account-name">{account.payload.accountName}</span>
                      </button>
                      <div
                        aria-label={`复制 ${account.payload.issuer} 的验证码`}
                        className={`authenticator-code-block ${copyTarget === account.id ? "success" : ""}`}
                        onClick={() => {
                          if (!code) return;
                          void handleCopy(account);
                        }}
                        onKeyDown={(event) => {
                          if (!code) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void handleCopy(account);
                          }
                        }}
                        role="button"
                        tabIndex={code ? 0 : -1}
                        title={`复制 ${account.payload.issuer} 的验证码`}
                      >
                        <code>{formatTotpCode(displayCode)}</code>
                        <div className="authenticator-progress" aria-label={`剩余 ${accountRemaining} 秒`}>
                          <span style={{ width: `${(accountRemaining / account.payload.period) * 100}%` }} />
                        </div>
                      </div>
                      <div className="authenticator-row-actions" aria-label={`${account.payload.issuer} 操作`}>
                        <Button className="authenticator-icon-btn" aria-label="显示二维码" title="显示二维码" onClick={() => void handleOpenQrDialog(account)}>
                          <QrCode size={15} />
                        </Button>
                        <Button className="authenticator-icon-btn" aria-label="编辑账号" title="编辑账号" onClick={() => handleOpenEditDialog(account)}>
                          <Pencil size={15} />
                        </Button>
                        <Button className={`authenticator-icon-btn ${copyTarget === account.id ? "success" : ""}`} aria-label="复制验证码" title="复制验证码" disabled={!code} onClick={() => void handleCopy(account)}>
                          <Copy size={15} />
                        </Button>
                        <Button className="authenticator-icon-btn danger" aria-label="删除账号" title="删除账号" onClick={() => setDialog({ type: "delete", account })}>
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">暂无 2FA 账号。</div>
            )}
            <div className="editor-footer">
              <span>{status === "unlocked" ? "AES-GCM · PBKDF2" : "密钥未解锁"}</span>
              <span>{status === "unlocked" ? "本地计算验证码" : "TOTP"}</span>
            </div>
          </section>
        </div>

        <aside className="side-stack authenticator-side-stack">
          {status === "empty" ? (
            <section className="inspector-panel">
              <div className="inspector-heading">
                <div className="inspector-title">创建保险库</div>
                <span className="health-badge warning">未创建</span>
              </div>
              <div className="authenticator-form-grid">
                <Field label="主密码">
                  <input aria-label="创建主密码" onChange={(event) => setMasterPassword(event.target.value)} type="password" value={masterPassword} />
                </Field>
                <Field label="确认主密码">
                  <input aria-label="确认主密码" onChange={(event) => setConfirmPassword(event.target.value)} type="password" value={confirmPassword} />
                </Field>
              </div>
              <Button className="authenticator-wide-btn" variant="primary" onClick={() => void handleCreateVault()}>
                <Unlock size={14} /> 创建并解锁
              </Button>
            </section>
          ) : null}

          {status === "locked" || status === "checking" ? (
            <section className="inspector-panel">
              <div className="inspector-heading">
                <div className="inspector-title">解锁保险库</div>
                <span className="health-badge warning">{statusText(status)}</span>
              </div>
              <Field label="主密码">
                <input aria-label="主密码" onChange={(event) => setMasterPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void handleUnlock()} type="password" value={masterPassword} />
              </Field>
              <Button className="authenticator-wide-btn" variant="primary" onClick={() => void handleUnlock()}>
                <Unlock size={14} /> 解锁
              </Button>
            </section>
          ) : null}

          {status === "unlocked" ? (
            <section className="inspector-panel authenticator-add-panel">
              <div className="inspector-heading">
                <div className="inspector-title">添加账号</div>
                <div className="segmented-control authenticator-form-tabs">
                  <button className={formMode === "manual" ? "active" : ""} onClick={() => setFormMode("manual")} type="button">
                    手动
                  </button>
                  <button className={formMode === "uri" ? "active" : ""} onClick={() => setFormMode("uri")} type="button">
                    URI
                  </button>
                </div>
              </div>
              {formMode === "uri" ? (
                <Field label="otpauth URI">
                  <textarea aria-label="otpauth URI" onChange={(event) => setForm((current) => ({ ...current, uri: event.target.value }))} spellCheck={false} value={form.uri} />
                </Field>
              ) : (
                <div className="authenticator-form-grid">
                  <Field label="服务商">
                    <input aria-label="服务商" onChange={(event) => setForm((current) => ({ ...current, issuer: event.target.value }))} value={form.issuer} />
                  </Field>
                  <Field label="账号">
                    <input aria-label="账号" onChange={(event) => setForm((current) => ({ ...current, accountName: event.target.value }))} value={form.accountName} />
                  </Field>
                  <Field label="Base32 密钥">
                    <input aria-label="Base32 密钥" onChange={(event) => setForm((current) => ({ ...current, secret: event.target.value }))} spellCheck={false} value={form.secret} />
                  </Field>
                  <Field label="算法">
                    <select aria-label="算法" onChange={(event) => setForm((current) => ({ ...current, algorithm: event.target.value as TotpAlgorithm }))} value={form.algorithm}>
                      <option value="SHA-1">SHA-1</option>
                      <option value="SHA-256">SHA-256</option>
                      <option value="SHA-512">SHA-512</option>
                    </select>
                  </Field>
                  <Field label="位数">
                    <select aria-label="验证码位数" onChange={(event) => setForm((current) => ({ ...current, digits: Number(event.target.value) as 6 | 8 }))} value={form.digits}>
                      <option value={6}>6</option>
                      <option value={8}>8</option>
                    </select>
                  </Field>
                  <Field label="周期">
                    <select aria-label="刷新周期" onChange={(event) => setForm((current) => ({ ...current, period: Number(event.target.value) as 15 | 30 | 60 }))} value={form.period}>
                      <option value={15}>15 秒</option>
                      <option value={30}>30 秒</option>
                      <option value={60}>60 秒</option>
                    </select>
                  </Field>
                </div>
              )}
              <Button className="authenticator-wide-btn" variant="primary" onClick={() => void handleSubmitForm()}>
                <Plus size={14} /> 添加账号
              </Button>
            </section>
          ) : null}

          <Panel
            className="authenticator-security-panel"
            title={
              <>
                <ShieldCheck size={15} /> 安全状态
              </>
            }
          >
            <div className="tiny-list">
              <div className="tiny-row">
                <span>保存方式</span>
                <code>AES-GCM</code>
              </div>
              <div className="tiny-row">
                <span>KDF</span>
                <code>PBKDF2 600k</code>
              </div>
              <div className="tiny-row">
                <span>验证码</span>
                <code>{status === "unlocked" ? "本地计算" : "锁定"}</code>
              </div>
            </div>
            <Button className="authenticator-wide-btn" variant={resetConfirm ? "danger" : "default"} onClick={() => void handleResetVault()}>
              <QrCode size={14} /> {resetConfirm ? "确认重置保险库" : "重置保险库"}
            </Button>
          </Panel>
        </aside>
      </section>

      {dialog ? (
        <div className="authenticator-dialog-backdrop" role="presentation" onMouseDown={closeDialog}>
          <section className="authenticator-dialog" role="dialog" aria-modal="true" aria-label={dialog.type === "delete" ? "删除 2FA 账号" : dialog.type === "edit" ? "编辑 2FA 账号" : "账号二维码"} onMouseDown={(event) => event.stopPropagation()}>
            <div className="authenticator-dialog-heading">
              <div>
                <strong>{dialog.type === "delete" ? "删除 2FA 账号" : dialog.type === "edit" ? "编辑 2FA 账号" : "账号二维码"}</strong>
                <span>{dialog.account.payload.issuer}</span>
              </div>
              <button
                className="authenticator-dialog-close"
                aria-label={dialog.type === "delete" ? "关闭删除确认弹窗" : dialog.type === "edit" ? "关闭编辑弹窗" : "关闭二维码弹窗"}
                type="button"
                onClick={closeDialog}
              >
                <X size={15} />
              </button>
            </div>

            {dialog.type === "delete" ? (
              <>
                <div className="authenticator-dialog-copy">
                  <p>确认删除这个 2FA 账号？删除后需要重新导入或手动添加。</p>
                  <div className="authenticator-dialog-account">
                    <strong>{dialog.account.payload.issuer}</strong>
                    <span>{dialog.account.payload.accountName}</span>
                  </div>
                </div>
                <div className="authenticator-dialog-actions">
                  <Button onClick={() => setDialog(null)}>取消</Button>
                  <Button variant="danger" onClick={() => void handleDelete(dialog.account)}>
                    <Trash2 size={14} /> 确认删除
                  </Button>
                </div>
              </>
            ) : dialog.type === "edit" ? (
              <>
                <div className="authenticator-dialog-copy">
                  <p>只修改列表显示和备份标签，不会更改密钥、算法或验证码周期。</p>
                  <div className="authenticator-edit-grid">
                    <Field label="服务商">
                      <input
                        aria-label="编辑服务商"
                        autoFocus
                        onChange={(event) => setEditForm((current) => ({ ...current, issuer: event.target.value }))}
                        value={editForm.issuer}
                      />
                    </Field>
                    <Field label="账号">
                      <input aria-label="编辑账号" onChange={(event) => setEditForm((current) => ({ ...current, accountName: event.target.value }))} value={editForm.accountName} />
                    </Field>
                  </div>
                </div>
                <div className="authenticator-dialog-actions">
                  <Button onClick={closeDialog}>取消</Button>
                  <Button variant="primary" onClick={() => void handleSaveEdit(dialog.account)}>
                    <Pencil size={14} /> 保存修改
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="authenticator-dialog-copy">
                  <p>二维码包含 2FA 密钥，请只在可信设备或应用中扫描。</p>
                  <div className="authenticator-dialog-account">
                    <strong>{dialog.account.payload.issuer}</strong>
                    <span>{dialog.account.payload.accountName}</span>
                  </div>
                </div>
                <div className="authenticator-qr-frame">
                  {qrDataUrl ? <img alt={`${dialog.account.payload.issuer} 账号二维码`} src={qrDataUrl} /> : <span>生成中...</span>}
                </div>
                <div className="authenticator-dialog-actions">
                  <Button onClick={closeDialog}>关闭</Button>
                  <Button variant="primary" onClick={() => void handleCopyOtpAuthUri(dialog.account)}>
                    <Copy size={14} /> 复制 otpauth URI
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
