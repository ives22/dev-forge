export const MAX_PUBLIC_TRANSLATE_CHARS = 500;
export const MAX_KEY_TRANSLATE_CHARS = 5000;

export const translateLanguages = [
  { code: "auto", label: "自动检测", supportsSource: true },
  { code: "zh-CN", label: "中文", supportsSource: true },
  { code: "en", label: "英语", supportsSource: true },
  { code: "ja", label: "日语", supportsSource: true },
  { code: "ko", label: "韩语", supportsSource: true },
  { code: "fr", label: "法语", supportsSource: true },
  { code: "de", label: "德语", supportsSource: true },
  { code: "es", label: "西班牙语", supportsSource: true },
  { code: "ru", label: "俄语", supportsSource: true }
] as const;

export type TranslateLanguageCode = (typeof translateLanguages)[number]["code"];
export type ConcreteTranslateLanguageCode = Exclude<TranslateLanguageCode, "auto">;
export type TranslateProviderId = "mymemory" | "baidu" | "azure" | "deepl" | "google";
export type TranslateProviderMode = "public-api" | "user-key-api";
export type TranslateProviderStatus = "ready";

export interface TranslateProvider {
  id: TranslateProviderId;
  name: string;
  mode: TranslateProviderMode;
  status: TranslateProviderStatus;
  requiresApiKey: boolean;
  description: string;
  limitLabel: string;
}

export interface BaiduTranslateCredential {
  appId: string;
  secretKey: string;
}

export interface AzureTranslateCredential {
  key: string;
  region: string;
}

export interface DeepLTranslateCredential {
  authKey: string;
}

export interface GoogleTranslateCredential {
  apiKey: string;
}

export interface TranslateCredentials {
  baidu?: BaiduTranslateCredential;
  azure?: AzureTranslateCredential;
  deepl?: DeepLTranslateCredential;
  google?: GoogleTranslateCredential;
}

export type TranslateCredential = TranslateCredentials[keyof TranslateCredentials];

export interface TranslateRequest {
  text: string;
  sourceLanguage: TranslateLanguageCode;
  targetLanguage: ConcreteTranslateLanguageCode;
  providerId: TranslateProviderId;
}

export interface TranslateOptions {
  credentials?: TranslateCredentials;
  saltFactory?: () => string;
}

export interface TranslateResult {
  translatedText: string;
  providerId: TranslateProviderId;
  providerName: string;
  sourceLanguage: ConcreteTranslateLanguageCode;
  detectedSourceLanguage: ConcreteTranslateLanguageCode | null;
  targetLanguage: ConcreteTranslateLanguageCode;
  characterCount: number;
  match: number | null;
}

interface MyMemoryResponse {
  responseStatus?: number;
  responseDetails?: string;
  responseData?: {
    translatedText?: string;
    match?: number | string;
  };
}

interface BaiduResponse {
  from?: string;
  to?: string;
  error_code?: string;
  error_msg?: string;
  trans_result?: Array<{ src?: string; dst?: string }>;
}

interface AzureResponse {
  detectedLanguage?: { language?: string };
  translations?: Array<{ text?: string; to?: string }>;
}

interface DeepLResponse {
  translations?: Array<{ detected_source_language?: string; text?: string }>;
  message?: string;
}

interface GoogleResponse {
  data?: {
    translations?: Array<{ translatedText?: string; detectedSourceLanguage?: string }>;
  };
  error?: { message?: string };
}

export const translateProviders: TranslateProvider[] = [
  {
    id: "mymemory",
    name: "MyMemory 公共接口",
    mode: "public-api",
    status: "ready",
    requiresApiKey: false,
    description: "免配置，适合短句和快速查询。",
    limitLabel: `单次 ${MAX_PUBLIC_TRANSLATE_CHARS} 字符，匿名额度较低`
  },
  {
    id: "baidu",
    name: "百度翻译 API",
    mode: "user-key-api",
    status: "ready",
    requiresApiKey: true,
    description: "使用用户自己的百度翻译免费额度。",
    limitLabel: "配置 APP ID / Secret 后可用"
  },
  {
    id: "azure",
    name: "Azure Translator",
    mode: "user-key-api",
    status: "ready",
    requiresApiKey: true,
    description: "使用用户自己的 Azure Translator 免费层。",
    limitLabel: "配置 Key / Region 后可用"
  },
  {
    id: "deepl",
    name: "DeepL API",
    mode: "user-key-api",
    status: "ready",
    requiresApiKey: true,
    description: "使用用户自己的 DeepL API Free。",
    limitLabel: "配置 Auth Key 后可用"
  },
  {
    id: "google",
    name: "Google Cloud Translation",
    mode: "user-key-api",
    status: "ready",
    requiresApiKey: true,
    description: "使用用户自己的 Google Cloud 免费额度。",
    limitLabel: "配置 Cloud API Key 后可用"
  }
];

const baiduLanguageMap: Record<ConcreteTranslateLanguageCode, string> = {
  "zh-CN": "zh",
  en: "en",
  ja: "jp",
  ko: "kor",
  fr: "fra",
  de: "de",
  es: "spa",
  ru: "ru"
};

const azureLanguageMap: Record<ConcreteTranslateLanguageCode, string> = {
  "zh-CN": "zh-Hans",
  en: "en",
  ja: "ja",
  ko: "ko",
  fr: "fr",
  de: "de",
  es: "es",
  ru: "ru"
};

const deeplLanguageMap: Record<ConcreteTranslateLanguageCode, string> = {
  "zh-CN": "ZH-HANS",
  en: "EN",
  ja: "JA",
  ko: "KO",
  fr: "FR",
  de: "DE",
  es: "ES",
  ru: "RU"
};

export function providerById(providerId: TranslateProviderId): TranslateProvider {
  return translateProviders.find((provider) => provider.id === providerId) ?? translateProviders[0];
}

export function languageLabel(code: TranslateLanguageCode): string {
  return translateLanguages.find((language) => language.code === code)?.label ?? code;
}

export function detectSourceLanguage(text: string, fallback: ConcreteTranslateLanguageCode): ConcreteTranslateLanguageCode {
  if (/[\u4e00-\u9fff]/.test(text)) return "zh-CN";
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[а-яё]/i.test(text)) return "ru";
  if (/[a-z]/i.test(text)) return "en";
  return fallback;
}

export function upsertTranslateCredential(
  current: TranslateCredentials,
  providerId: Exclude<TranslateProviderId, "mymemory">,
  credential: NonNullable<TranslateCredentials[typeof providerId]>
): TranslateCredentials {
  return { ...current, [providerId]: normalizeCredential(providerId, credential) };
}

export function removeTranslateCredential(current: TranslateCredentials, providerId: Exclude<TranslateProviderId, "mymemory">): TranslateCredentials {
  const next = { ...current };
  delete next[providerId];
  return next;
}

export function hasTranslateCredential(credentials: TranslateCredentials | undefined, providerId: TranslateProviderId): boolean {
  if (providerId === "mymemory") return true;
  return Boolean(validateCredential(providerId, credentials?.[providerId]));
}

export function maskTranslateCredential(credential: TranslateCredential | undefined): string {
  const secret = credentialSecret(credential);
  if (!secret) return "未配置";
  if (secret.length <= 4) return "••••";
  return `${"•".repeat(Math.min(10, Math.max(6, secret.length - 2)))}${secret.slice(-2)}`;
}

export function buildMyMemoryUrl(text: string, sourceLanguage: ConcreteTranslateLanguageCode, targetLanguage: ConcreteTranslateLanguageCode): string {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", `${sourceLanguage}|${targetLanguage}`);
  return url.toString();
}

export async function buildBaiduSignPayload(
  text: string,
  sourceLanguage: ConcreteTranslateLanguageCode,
  targetLanguage: ConcreteTranslateLanguageCode,
  credential: BaiduTranslateCredential,
  salt: string
): Promise<Record<string, string>> {
  const from = baiduLanguageMap[sourceLanguage];
  const to = baiduLanguageMap[targetLanguage];
  return {
    q: text,
    from,
    to,
    appid: credential.appId,
    salt,
    sign: md5(`${credential.appId}${text}${salt}${credential.secretKey}`)
  };
}

export async function translateText(request: TranslateRequest, fetcher: typeof fetch = fetch, options: TranslateOptions = {}): Promise<TranslateResult> {
  const text = request.text.trim();
  if (!text) throw new Error("请输入要翻译的文本。");

  const provider = providerById(request.providerId);
  const sourceLanguage =
    request.sourceLanguage === "auto" ? detectSourceLanguage(text, request.targetLanguage === "en" ? "zh-CN" : "en") : request.sourceLanguage;
  const characterLimit = provider.mode === "public-api" ? MAX_PUBLIC_TRANSLATE_CHARS : MAX_KEY_TRANSLATE_CHARS;
  if (text.length > characterLimit) {
    throw new Error(`${provider.name} 单次最多支持 ${characterLimit} 字符，请缩短文本后重试。`);
  }

  if (provider.id === "mymemory") {
    return translateWithMyMemory(text, sourceLanguage, request, fetcher, provider);
  }

  if (provider.id === "baidu") {
    const credential = validateCredential("baidu", options.credentials?.baidu);
    if (!credential) throw new Error(`${provider.name} 需要配置 API Key。`);
    return translateWithBaidu(text, sourceLanguage, request, fetcher, provider, credential, options.saltFactory?.() ?? Date.now().toString());
  }
  if (provider.id === "azure") {
    const credential = validateCredential("azure", options.credentials?.azure);
    if (!credential) throw new Error(`${provider.name} 需要配置 API Key。`);
    return translateWithAzure(text, sourceLanguage, request, fetcher, provider, credential);
  }
  if (provider.id === "deepl") {
    const credential = validateCredential("deepl", options.credentials?.deepl);
    if (!credential) throw new Error(`${provider.name} 需要配置 API Key。`);
    return translateWithDeepL(text, sourceLanguage, request, fetcher, provider, credential);
  }
  const credential = validateCredential("google", options.credentials?.google);
  if (!credential) throw new Error(`${provider.name} 需要配置 API Key。`);
  return translateWithGoogle(text, sourceLanguage, request, fetcher, provider, credential);
}

async function translateWithMyMemory(
  text: string,
  sourceLanguage: ConcreteTranslateLanguageCode,
  request: TranslateRequest,
  fetcher: typeof fetch,
  provider: TranslateProvider
): Promise<TranslateResult> {
  const url = buildMyMemoryUrl(text, sourceLanguage, request.targetLanguage);
  const response = await fetcher(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`翻译接口暂不可用：HTTP ${response.status}`);

  const payload = (await response.json()) as MyMemoryResponse;
  if (payload.responseStatus && payload.responseStatus >= 400) {
    throw new Error(payload.responseDetails || `翻译接口返回错误：${payload.responseStatus}`);
  }

  const translatedText = payload.responseData?.translatedText?.trim();
  if (!translatedText) throw new Error("翻译接口没有返回有效译文。");

  const rawMatch = payload.responseData?.match;
  const match = typeof rawMatch === "number" ? rawMatch : typeof rawMatch === "string" ? Number(rawMatch) : null;

  return makeResult(translatedText, provider, sourceLanguage, request, Number.isFinite(match) ? match : null);
}

async function translateWithBaidu(
  text: string,
  sourceLanguage: ConcreteTranslateLanguageCode,
  request: TranslateRequest,
  fetcher: typeof fetch,
  provider: TranslateProvider,
  credential: BaiduTranslateCredential,
  salt: string
): Promise<TranslateResult> {
  const payload = await buildBaiduSignPayload(text, sourceLanguage, request.targetLanguage, credential, salt);
  const response = await fetcher("https://fanyi-api.baidu.com/api/trans/vip/translate", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams(payload),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`百度翻译接口暂不可用：HTTP ${response.status}`);

  const data = (await response.json()) as BaiduResponse;
  if (data.error_code) throw new Error(data.error_msg || `百度翻译错误：${data.error_code}`);
  const translatedText = (data.trans_result ?? []).map((item) => item.dst).filter(Boolean).join("\n").trim();
  if (!translatedText) throw new Error("百度翻译没有返回有效译文。");
  return makeResult(translatedText, provider, sourceLanguage, request, null);
}

async function translateWithAzure(
  text: string,
  sourceLanguage: ConcreteTranslateLanguageCode,
  request: TranslateRequest,
  fetcher: typeof fetch,
  provider: TranslateProvider,
  credential: AzureTranslateCredential
): Promise<TranslateResult> {
  const url = new URL("https://api.cognitive.microsofttranslator.com/translate");
  url.searchParams.set("api-version", "3.0");
  url.searchParams.set("to", azureLanguageMap[request.targetLanguage]);
  if (request.sourceLanguage !== "auto") url.searchParams.set("from", azureLanguageMap[sourceLanguage]);

  const response = await fetcher(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": credential.key,
      "Ocp-Apim-Subscription-Region": credential.region
    },
    body: JSON.stringify([{ text }]),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Azure Translator 暂不可用：HTTP ${response.status}`);

  const data = (await response.json()) as AzureResponse[];
  const first = data[0];
  const translatedText = first?.translations?.[0]?.text?.trim();
  if (!translatedText) throw new Error("Azure Translator 没有返回有效译文。");
  const detected = parseConcreteLanguage(first.detectedLanguage?.language);
  return makeResult(translatedText, provider, request.sourceLanguage === "auto" ? detected ?? sourceLanguage : sourceLanguage, request, null, detected);
}

async function translateWithDeepL(
  text: string,
  sourceLanguage: ConcreteTranslateLanguageCode,
  request: TranslateRequest,
  fetcher: typeof fetch,
  provider: TranslateProvider,
  credential: DeepLTranslateCredential
): Promise<TranslateResult> {
  const body = new URLSearchParams();
  body.set("text", text);
  body.set("target_lang", deeplLanguageMap[request.targetLanguage]);
  if (request.sourceLanguage !== "auto") body.set("source_lang", deeplLanguageMap[sourceLanguage]);

  const response = await fetcher("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${credential.authKey}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body,
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`DeepL API 暂不可用：HTTP ${response.status}`);

  const data = (await response.json()) as DeepLResponse;
  if (data.message) throw new Error(data.message);
  const translation = data.translations?.[0];
  const translatedText = translation?.text?.trim();
  if (!translatedText) throw new Error("DeepL 没有返回有效译文。");
  const detected = parseConcreteLanguage(translation?.detected_source_language);
  return makeResult(translatedText, provider, request.sourceLanguage === "auto" ? detected ?? sourceLanguage : sourceLanguage, request, null, detected);
}

async function translateWithGoogle(
  text: string,
  sourceLanguage: ConcreteTranslateLanguageCode,
  request: TranslateRequest,
  fetcher: typeof fetch,
  provider: TranslateProvider,
  credential: GoogleTranslateCredential
): Promise<TranslateResult> {
  const url = new URL("https://translation.googleapis.com/language/translate/v2");
  url.searchParams.set("key", credential.apiKey);
  const body: Record<string, string> = {
    q: text,
    target: request.targetLanguage,
    format: "text"
  };
  if (request.sourceLanguage !== "auto") body.source = sourceLanguage;

  const response = await fetcher(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Google Cloud Translation 暂不可用：HTTP ${response.status}`);

  const data = (await response.json()) as GoogleResponse;
  if (data.error?.message) throw new Error(data.error.message);
  const translation = data.data?.translations?.[0];
  const translatedText = translation?.translatedText?.trim();
  if (!translatedText) throw new Error("Google Cloud Translation 没有返回有效译文。");
  const detected = parseConcreteLanguage(translation?.detectedSourceLanguage);
  return makeResult(translatedText, provider, request.sourceLanguage === "auto" ? detected ?? sourceLanguage : sourceLanguage, request, null, detected);
}

function makeResult(
  translatedText: string,
  provider: TranslateProvider,
  sourceLanguage: ConcreteTranslateLanguageCode,
  request: TranslateRequest,
  match: number | null,
  detectedSourceLanguage: ConcreteTranslateLanguageCode | null = request.sourceLanguage === "auto" ? sourceLanguage : null
): TranslateResult {
  return {
    translatedText,
    providerId: provider.id,
    providerName: provider.name,
    sourceLanguage,
    detectedSourceLanguage,
    targetLanguage: request.targetLanguage,
    characterCount: request.text.trim().length,
    match
  };
}

function normalizeCredential(providerId: Exclude<TranslateProviderId, "mymemory">, credential: TranslateCredential): TranslateCredential {
  if (providerId === "baidu") {
    const value = credential as BaiduTranslateCredential;
    return { appId: value.appId.trim(), secretKey: value.secretKey.trim() };
  }
  if (providerId === "azure") {
    const value = credential as AzureTranslateCredential;
    return { key: value.key.trim(), region: value.region.trim() };
  }
  if (providerId === "deepl") {
    const value = credential as DeepLTranslateCredential;
    return { authKey: value.authKey.trim() };
  }
  const value = credential as GoogleTranslateCredential;
  return { apiKey: value.apiKey.trim() };
}

function validateCredential<T extends Exclude<TranslateProviderId, "mymemory">>(
  providerId: T,
  credential: TranslateCredentials[T] | undefined
): NonNullable<TranslateCredentials[T]> | null {
  if (!credential) return null;
  const normalized = normalizeCredential(providerId, credential) as NonNullable<TranslateCredentials[T]>;
  if (providerId === "baidu") {
    const value = normalized as BaiduTranslateCredential;
    return value.appId && value.secretKey ? normalized : null;
  }
  if (providerId === "azure") {
    const value = normalized as AzureTranslateCredential;
    return value.key && value.region ? normalized : null;
  }
  if (providerId === "deepl") {
    const value = normalized as DeepLTranslateCredential;
    return value.authKey ? normalized : null;
  }
  const value = normalized as GoogleTranslateCredential;
  return value.apiKey ? normalized : null;
}

function credentialSecret(credential: TranslateCredential | undefined): string {
  if (!credential) return "";
  if ("secretKey" in credential) return credential.secretKey;
  if ("key" in credential) return credential.key;
  if ("authKey" in credential) return credential.authKey;
  if ("apiKey" in credential) return credential.apiKey;
  return "";
}

function parseConcreteLanguage(value: string | undefined): ConcreteTranslateLanguageCode | null {
  const normalized = String(value ?? "").toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("ja") || normalized === "jp") return "ja";
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("ru")) return "ru";
  return null;
}

function md5(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const words = Array.from({ length: (((bytes.length + 8) >>> 6) + 1) * 16 }, () => 0);
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >> 2] |= bytes[index] << ((index % 4) * 8);
  }
  words[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
  const bitLength = bytes.length * 8;
  words[words.length - 2] = bitLength & 0xffffffff;
  words[words.length - 1] = Math.floor(bitLength / 0x100000000);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let chunk = 0; chunk < words.length; chunk += 16) {
    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;

    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let g: number;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }
      const next = d;
      d = c;
      c = b;
      b = add32(b, rotateLeft(add32(add32(a, f), add32(md5Constants[index], words[chunk + g])), md5Shifts[index]));
      a = next;
    }

    a = add32(a, aa);
    b = add32(b, bb);
    c = add32(c, cc);
    d = add32(d, dd);
  }

  return [a, b, c, d].map(wordToHex).join("");
}

const md5Shifts = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
];

const md5Constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) | 0);

function add32(left: number, right: number): number {
  return (left + right) | 0;
}

function rotateLeft(value: number, count: number): number {
  return (value << count) | (value >>> (32 - count));
}

function wordToHex(value: number): string {
  let output = "";
  for (let index = 0; index < 4; index += 1) {
    output += ((value >>> (index * 8)) & 0xff).toString(16).padStart(2, "0");
  }
  return output;
}
