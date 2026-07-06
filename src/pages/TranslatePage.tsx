import { ArrowLeftRight, Copy, KeyRound, Languages, Loader2, Repeat2, Settings, Trash2, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FocusEvent } from "react";
import { Button, EditorPanel, Field, Panel } from "../components/Panel";
import { usePageChrome } from "../hooks/usePageChrome";
import { copyText, readClipboardText, translateTextWithProvider } from "../lib/desktop";
import {
  deleteTranslateCredential,
  getTranslateCredentials,
  saveTranslateCredential,
  type UsageDraft
} from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import {
  hasTranslateCredential,
  languageLabel,
  maskTranslateCredential,
  MAX_PUBLIC_TRANSLATE_CHARS,
  MAX_KEY_TRANSLATE_CHARS,
  providerById,
  translateLanguages,
  translateProviders,
  type BaiduTranslateCredential,
  type ConcreteTranslateLanguageCode,
  type DeepLTranslateCredential,
  type GoogleTranslateCredential,
  type AzureTranslateCredential,
  type TranslateCredential,
  type TranslateCredentials,
  type TranslateLanguageCode,
  type TranslateProviderId,
  type TranslateResult
} from "../lib/tools/translate";

const targetLanguages = translateLanguages.filter((language) => language.code !== "auto") as Array<{
  code: ConcreteTranslateLanguageCode;
  label: string;
}>;

type TranslateStatus = "idle" | "loading" | "ready" | "error";
type TranslateTrigger = "manual" | "auto";
type ConfigurableTranslateProviderId = Exclude<TranslateProviderId, "mymemory">;

const providerShortLabels: Record<ConfigurableTranslateProviderId, string> = {
  baidu: "百度",
  azure: "Azure",
  deepl: "DeepL",
  google: "Google"
};

function statusText(status: TranslateStatus) {
  if (status === "loading") return "翻译中";
  if (status === "ready") return "完成";
  if (status === "error") return "错误";
  return "待翻译";
}

function resultToText(result: TranslateResult | null, output: string) {
  if (!result) return output;
  return [
    `Provider: ${result.providerName}`,
    `Language: ${languageLabel(result.sourceLanguage)} -> ${languageLabel(result.targetLanguage)}`,
    "",
    output
  ].join("\n");
}

function editableCredential(providerId: ConfigurableTranslateProviderId, credentials: TranslateCredentials): NonNullable<TranslateCredential> {
  if (providerId === "baidu") return credentials.baidu ?? { appId: "", secretKey: "" };
  if (providerId === "azure") return credentials.azure ?? { key: "", region: "" };
  if (providerId === "deepl") return credentials.deepl ?? { authKey: "" };
  return credentials.google ?? { apiKey: "" };
}

function credentialToDraft(credential: NonNullable<TranslateCredential>): Record<string, string> {
  return Object.fromEntries(Object.entries(credential).map(([key, value]) => [key, String(value ?? "")]));
}

function draftToCredential(providerId: ConfigurableTranslateProviderId, draft: Record<string, string>): TranslateCredential {
  if (providerId === "baidu") return { appId: draft.appId ?? "", secretKey: draft.secretKey ?? "" } satisfies BaiduTranslateCredential;
  if (providerId === "azure") return { key: draft.key ?? "", region: draft.region ?? "" } satisfies AzureTranslateCredential;
  if (providerId === "deepl") return { authKey: draft.authKey ?? "" } satisfies DeepLTranslateCredential;
  return { apiKey: draft.apiKey ?? "" } satisfies GoogleTranslateCredential;
}

function credentialFields(providerId: ConfigurableTranslateProviderId) {
  if (providerId === "baidu") {
    return [
      { key: "appId", label: "APP ID", secret: false },
      { key: "secretKey", label: "Secret Key", secret: true }
    ] as const;
  }
  if (providerId === "azure") {
    return [
      { key: "key", label: "Subscription Key", secret: true },
      { key: "region", label: "Region", secret: false }
    ] as const;
  }
  if (providerId === "deepl") return [{ key: "authKey", label: "Auth Key", secret: true }] as const;
  return [{ key: "apiKey", label: "API Key", secret: true }] as const;
}

function TranslateCredentialDialog({
  providerId,
  credentials,
  onClose,
  onSave,
  onDelete
}: {
  providerId: ConfigurableTranslateProviderId;
  credentials: TranslateCredentials;
  onClose: () => void;
  onSave: (providerId: ConfigurableTranslateProviderId, credential: TranslateCredential) => Promise<void>;
  onDelete: (providerId: ConfigurableTranslateProviderId) => Promise<void>;
}) {
  const provider = providerById(providerId);
  const [draft, setDraft] = useState<Record<string, string>>(() => credentialToDraft(editableCredential(providerId, credentials)));
  const [message, setMessage] = useState("");
  const fields = credentialFields(providerId);
  const configured = hasTranslateCredential(credentials, providerId);

  useEffect(() => {
    setDraft(credentialToDraft(editableCredential(providerId, credentials)));
    setMessage("");
  }, [providerId]);

  const setField = (key: string, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    try {
      const credential = draftToCredential(providerId, draft);
      if (!hasTranslateCredential({ [providerId]: credential }, providerId)) {
        setMessage("请完整填写配置");
        return;
      }
      await onSave(providerId, credential);
      setMessage("配置已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    }
  };

  const remove = async () => {
    await onDelete(providerId);
    setDraft(credentialToDraft(editableCredential(providerId, {})));
    setMessage("配置已删除");
  };

  return (
    <div className="translate-dialog-backdrop" role="presentation">
      <section className="translate-dialog" role="dialog" aria-modal="true" aria-label={`${provider.name} 配置`}>
        <div className="translate-dialog-header">
          <div>
            <strong>{provider.name}</strong>
            <span>{provider.description}</span>
          </div>
          <button className="theme-toggle" type="button" aria-label="关闭配置弹窗" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="translate-dialog-body">
          {fields.map((field) => (
            <Field label={field.label} key={field.key}>
              <input
                type={field.secret ? "password" : "text"}
                value={draft[field.key] ?? ""}
                onChange={(event) => setField(field.key, event.target.value)}
                autoComplete="off"
              />
            </Field>
          ))}
          <div className="translate-dialog-status">
            <KeyRound size={15} />
            <span>{configured ? `当前已保存：${maskTranslateCredential(credentials[providerId])}` : "当前未保存配置"}</span>
          </div>
          {message ? <div className="translate-dialog-message">{message}</div> : null}
        </div>
        <div className="translate-dialog-actions">
          <Button onClick={() => void remove()} disabled={!configured}>
            <Trash2 size={14} /> 删除配置
          </Button>
          <Button onClick={onClose}>关闭</Button>
          <Button variant="primary" onClick={() => void save()}>
            保存配置
          </Button>
        </div>
      </section>
    </div>
  );
}

export function TranslatePage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [input, setInput] = useState("DevForge 需要一个快捷、免配置、在工具内直接返回结果的翻译入口。");
  const [output, setOutput] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState<TranslateLanguageCode>("auto");
  const [targetLanguage, setTargetLanguage] = useState<ConcreteTranslateLanguageCode>("en");
  const [providerId, setProviderId] = useState<TranslateProviderId>("mymemory");
  const [status, setStatus] = useState<TranslateStatus>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [copyLabel, setCopyLabel] = useState("复制译文");
  const [credentials, setCredentials] = useState<TranslateCredentials>({});
  const [configProviderId, setConfigProviderId] = useState<ConfigurableTranslateProviderId | null>(null);
  const lastTranslateSignatureRef = useRef<string | null>(null);
  const pendingTranslateSignatureRef = useRef<string | null>(null);
  const skipNextAutoTranslateRef = useRef(false);

  const selectedProvider = useMemo(() => providerById(providerId), [providerId]);
  const characterLimit = selectedProvider.mode === "public-api" ? MAX_PUBLIC_TRANSLATE_CHARS : MAX_KEY_TRANSLATE_CHARS;
  const charsLeft = Math.max(0, characterLimit - input.trim().length);
  const overLimit = input.trim().length > characterLimit;
  const selectedProviderConfigured = hasTranslateCredential(credentials, providerId);
  const metrics = [
    { label: "输入", value: input.trim().length },
    { label: "剩余", value: charsLeft },
    { label: "状态", value: statusText(status) }
  ];

  usePageChrome({
    tool: toolById.translate,
    kicker: "免配置公共 API 直接翻译，也支持自带免费额度 Key",
    metrics
  });

  useEffect(() => {
    void getTranslateCredentials().then(setCredentials);
  }, []);

  const persist = async (action: string, nextStatus: UsageDraft["status"], provider = selectedProvider) => {
    await recordUsage({
      toolId: "translate",
      action,
      input: `${provider.id}:${sourceLanguage}->${targetLanguage}:${input.trim().length} chars`,
      output: result ? `${result.providerId}:${result.characterCount} chars` : `${provider.id}:${statusText(status)}`,
      status: nextStatus
    });
  };

  const resetCompletedTranslateSignature = () => {
    lastTranslateSignatureRef.current = null;
  };

  const translateSignature = (text: string) => [providerId, sourceLanguage, targetLanguage, text].join("\n");

  const updateInput = (value: string) => {
    if (value.trim() !== input.trim()) resetCompletedTranslateSignature();
    setInput(value);
  };

  const updateSourceLanguage = (value: TranslateLanguageCode) => {
    resetCompletedTranslateSignature();
    setSourceLanguage(value);
  };

  const updateTargetLanguage = (value: ConcreteTranslateLanguageCode) => {
    resetCompletedTranslateSignature();
    setTargetLanguage(value);
  };

  const updateProviderId = (value: TranslateProviderId) => {
    resetCompletedTranslateSignature();
    setProviderId(value);
  };

  const markEditorAction = () => {
    skipNextAutoTranslateRef.current = true;
  };

  const clearInput = () => {
    skipNextAutoTranslateRef.current = false;
    resetCompletedTranslateSignature();
    setInput("");
  };

  const runTranslate = async (trigger: TranslateTrigger = "manual") => {
    if (trigger === "manual") skipNextAutoTranslateRef.current = false;
    const text = input.trim();
    if (!text || overLimit || pendingTranslateSignatureRef.current) return;

    const signature = translateSignature(text);
    if (lastTranslateSignatureRef.current === signature) return;

    if (selectedProvider.requiresApiKey && !selectedProviderConfigured) {
      setStatus("error");
      setError(`${selectedProvider.name} 需要先保存配置。`);
      if (trigger === "manual") setConfigProviderId(providerId as ConfigurableTranslateProviderId);
      return;
    }

    pendingTranslateSignatureRef.current = signature;
    setStatus("loading");
    setError("");
    try {
      const next = await translateTextWithProvider({
        text: input,
        sourceLanguage,
        targetLanguage,
        providerId
      }, {
        credentials
      });
      setResult(next);
      setOutput(next.translatedText);
      setStatus("ready");
      lastTranslateSignatureRef.current = signature;
      await persist("translate", "ok", providerById(next.providerId));
    } catch (translationError) {
      const message = translationError instanceof Error ? translationError.message : "翻译失败，请稍后重试。";
      setStatus("error");
      setError(message);
      setResult(null);
      await persist("translate", "error");
    } finally {
      if (pendingTranslateSignatureRef.current === signature) {
        pendingTranslateSignatureRef.current = null;
      }
    }
  };

  const handleInputBlur = (event: FocusEvent<HTMLTextAreaElement>) => {
    const nextTarget = event.relatedTarget;
    const isEditorAction =
      nextTarget instanceof HTMLElement && nextTarget.closest("[data-translate-editor-action='true']");
    if (skipNextAutoTranslateRef.current || isEditorAction) {
      skipNextAutoTranslateRef.current = false;
      return;
    }
    void runTranslate("auto");
  };

  const swapLanguages = () => {
    resetCompletedTranslateSignature();
    if (sourceLanguage === "auto") {
      setSourceLanguage(targetLanguage);
      setTargetLanguage("zh-CN");
    } else {
      setSourceLanguage(targetLanguage);
      setTargetLanguage(sourceLanguage);
    }
    if (output) {
      setInput(output);
      setOutput(input);
    }
  };

  const pasteClipboard = async () => {
    const text = await readClipboardText();
    if (text) updateInput(text);
  };

  const copyOutput = async () => {
    if (!output) return;
    await copyText(output);
    setCopyLabel("已复制");
    window.setTimeout(() => setCopyLabel("复制译文"), 900);
    await persist("copy", "ok");
  };

  const loadSample = () => {
    resetCompletedTranslateSignature();
    setInput("The fastest tool is the one that keeps the translation in the same window.");
    setOutput("");
    setSourceLanguage("auto");
    setTargetLanguage("zh-CN");
    setStatus("idle");
    setError("");
    setResult(null);
  };

  const saveCredential = async (targetProviderId: ConfigurableTranslateProviderId, credential: TranslateCredential) => {
    const next = await saveTranslateCredential(targetProviderId, credential);
    setCredentials(next);
  };

  const deleteCredential = async (targetProviderId: ConfigurableTranslateProviderId) => {
    const next = await deleteTranslateCredential(targetProviderId);
    setCredentials(next);
  };

  return (
    <section className="tool-shell translate-tool-shell" aria-label="文本翻译工具">
      <section className="mode-strip translate-mode-strip" aria-label="翻译操作">
        <div className="translate-language-bar">
          <Field label="源语言">
            <select value={sourceLanguage} onChange={(event) => updateSourceLanguage(event.target.value as TranslateLanguageCode)}>
              {translateLanguages.map((language) => (
                <option value={language.code} key={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </Field>
          <button className="swap-btn translate-language-swap" type="button" aria-label="交换翻译语言" onClick={swapLanguages}>
            <ArrowLeftRight size={17} />
          </button>
          <Field label="目标语言">
            <select value={targetLanguage} onChange={(event) => updateTargetLanguage(event.target.value as ConcreteTranslateLanguageCode)}>
              {targetLanguages.map((language) => (
                <option value={language.code} key={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mode-tools">
          <Button onClick={() => void pasteClipboard()}>读取剪贴板</Button>
          <Button onClick={loadSample}>示例</Button>
          <Button variant="primary" onClick={() => void runTranslate("manual")} disabled={status === "loading" || overLimit}>
            {status === "loading" ? <Loader2 size={14} className="spin-icon" /> : <Wand2 size={14} />}
            翻译
          </Button>
        </div>
      </section>

      <div className="single-workbench translate-workbench">
        <div className="single-main translate-editor-stack">
          <EditorPanel
            title="原文"
            actions={
              <>
                <Button data-translate-editor-action="true" onPointerDown={markEditorAction} onMouseDown={markEditorAction} onClick={clearInput}>
                  清空
                </Button>
                <Button
                  data-translate-editor-action="true"
                  aria-label="翻译原文"
                  variant="primary"
                  onPointerDown={markEditorAction}
                  onMouseDown={markEditorAction}
                  onClick={() => void runTranslate("manual")}
                  disabled={status === "loading" || overLimit}
                >
                  {status === "loading" ? <Loader2 size={14} className="spin-icon" /> : <Wand2 size={14} />}
                  翻译
                </Button>
              </>
            }
            value={input}
            onChange={updateInput}
            onBlur={handleInputBlur}
            footerLeft={`${input.trim().length} / ${characterLimit} chars`}
            footerRight={overLimit ? <span className="error-text">当前来源超限</span> : languageLabel(sourceLanguage)}
            className="translate-editor-panel"
            textareaClassName="translate-textarea"
            showLineNumbers={false}
          />
          <div className="url-swap-bar translate-swap-bar">
            <button className="swap-btn" type="button" aria-label="交换原文和译文" onClick={swapLanguages}>
              <Repeat2 size={18} />
            </button>
          </div>
          <EditorPanel
            title="译文"
            actions={
              <Button onClick={() => void copyOutput()} disabled={!output}>
                <Copy size={14} /> {copyLabel}
              </Button>
            }
            value={output}
            readOnly
            footerLeft={<span className={status === "error" ? "error-text" : ""}>{status === "error" ? error : statusText(status)}</span>}
            footerRight={result?.detectedSourceLanguage ? `检测为 ${languageLabel(result.detectedSourceLanguage)}` : languageLabel(targetLanguage)}
            className="translate-editor-panel"
            textareaClassName="translate-textarea"
            showLineNumbers={false}
          />
        </div>

        <aside className="side-stack translate-side-stack">
          <Panel title="翻译来源">
            <div className="translate-provider-list">
              {translateProviders.map((provider) => (
                <label className={`translate-provider-row ${provider.id === providerId ? "active" : ""}`} key={provider.id}>
                  <input
                    type="radio"
                    name="translate-provider"
                    value={provider.id}
                    checked={provider.id === providerId}
                    onChange={() => updateProviderId(provider.id)}
                  />
                  <span>
                    <strong>{provider.name}</strong>
                    <small>{provider.limitLabel}</small>
                  </span>
                  <em>{provider.requiresApiKey ? (hasTranslateCredential(credentials, provider.id) ? "已配置" : "需配置") : "可用"}</em>
                </label>
              ))}
            </div>
          </Panel>

          <Panel title="Provider 配置">
            <div className="button-grid translate-config-actions">
              {translateProviders
                .filter((provider) => provider.id !== "mymemory")
                .map((provider) => (
                  <Button key={provider.id} onClick={() => setConfigProviderId(provider.id as ConfigurableTranslateProviderId)}>
                    <Settings size={14} /> {providerShortLabels[provider.id as ConfigurableTranslateProviderId]}
                  </Button>
                ))}
            </div>
          </Panel>

          <Panel title="当前结果">
            <div className="tiny-list">
              <div className="tiny-row">
                <span>Provider</span>
                <code>{selectedProvider.name}</code>
              </div>
              <div className="tiny-row">
                <span>语言</span>
                <code>{`${languageLabel(result?.sourceLanguage ?? sourceLanguage)} -> ${languageLabel(targetLanguage)}`}</code>
              </div>
              <div className="tiny-row">
                <span>状态</span>
                <code>{selectedProviderConfigured ? statusText(status) : "未配置"}</code>
              </div>
            </div>
          </Panel>

          <Panel title="隐私边界">
            <div className="translate-note">
              <Languages size={16} />
              <span>触发翻译时才会把原文发送到所选接口；使用记录只保存语言、来源和字符数。</span>
            </div>
          </Panel>

          <Panel title="导出文本">
            <Button onClick={() => void copyText(resultToText(result, output))} disabled={!output}>
              <Copy size={14} /> 复制带来源文本
            </Button>
          </Panel>
        </aside>
      </div>
      {configProviderId ? (
        <TranslateCredentialDialog
          providerId={configProviderId}
          credentials={credentials}
          onClose={() => setConfigProviderId(null)}
          onSave={saveCredential}
          onDelete={deleteCredential}
        />
      ) : null}
    </section>
  );
}
