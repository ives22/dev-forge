import Database from "@tauri-apps/plugin-sql";
import { byteSize, nowIso, preview } from "./utils";
import { runnableTools, toolById, type ToolId } from "./toolRegistry";
import { normalizeTotpPayload, type TotpAccountPayload } from "./tools/authenticator";
import { removeTranslateCredential, upsertTranslateCredential, type TranslateCredentials, type TranslateProviderId, type TranslateCredential } from "./tools/translate";

export interface UsageRecord {
  id: number;
  tool_id: ToolId;
  action: string;
  input_preview: string | null;
  output_preview: string | null;
  input_bytes: number;
  output_bytes: number;
  status: "ok" | "error" | "warn";
  created_at: string;
}

export interface UsageDraft {
  toolId: ToolId;
  action: string;
  input?: string;
  output?: string;
  status: "ok" | "error" | "warn";
}

export type StorageBackend = "sqlite" | "fallback";

export interface ToolUsageCount {
  tool_id: ToolId;
  count: number;
  latest_at: string | null;
}

export interface UsageSummary {
  totalUsage: number;
  todayUsage: number;
  clipboardActions: number;
  averageResponseMs: number;
  toolCountTrendPercent: number;
  todayUsageTrendPercent: number;
  clipboardTrendPercent: number;
  okCount: number;
  warnCount: number;
  errorCount: number;
  recentToolCounts: ToolUsageCount[];
  toolCounts: ToolUsageCount[];
  backend: StorageBackend;
}

export interface AuthenticatorVaultMeta {
  version: 1;
  kdf: "PBKDF2-HMAC-SHA-256";
  iterations: number;
  salt: string;
  verifierIv: string;
  verifierCiphertext: string;
}

export interface EncryptedAuthenticatorRecord {
  id: string;
  payloadIv: string;
  payloadCiphertext: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export type AuthenticatorAccount = EncryptedAuthenticatorRecord & {
  payload: TotpAccountPayload;
};

const fallbackUsage: UsageRecord[] = [];
const fallbackSettings = new Map<string, unknown>();
const fallbackFavorites = new Map<string, ToolId[]>();
const fallbackAuthenticatorAccounts: EncryptedAuthenticatorRecord[] = [];
const localStoragePrefix = "devforge:";
const favoriteToolsKey = "favoriteTools";
const toolCountSnapshotsKey = "toolCountSnapshots";
const authenticatorVaultKey = "authenticatorVault";
const authenticatorAccountsKey = "authenticatorAccounts";
const translateCredentialsKey = "translateCredentials";
const authenticatorIterations = 600000;

let dbPromise: Promise<Database> | null = null;

export function resetStorageFallbacksForTests(): void {
  fallbackUsage.splice(0);
  fallbackSettings.clear();
  fallbackFavorites.clear();
  fallbackAuthenticatorAccounts.splice(0);
  dbPromise = null;
}

function isTauri() {
  return "__TAURI_INTERNALS__" in window;
}

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`${localStoragePrefix}${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(`${localStoragePrefix}${key}`, JSON.stringify(value));
  } catch {
    // Ignore storage failures and keep the in-memory fallback available.
  }
}

function isToolId(value: unknown): value is ToolId {
  return typeof value === "string" && value in toolById;
}

function normalizeFavoriteTools(value: unknown): ToolId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ToolId>();
  return value.filter((item): item is ToolId => {
    if (!isToolId(item) || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function toCount(value: unknown): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function startOfTodayIso(): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
}

function startOfYesterdayIso(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  return yesterday.toISOString();
}

function recentWindowStartIso(days = 7): string {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  return threshold.toISOString();
}

function localDateKey(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeToolCountSnapshots(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, count]) => [key, toCount(count)] as const)
      .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key))
      .slice(-14)
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function cryptoBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

async function deriveAuthenticatorKey(masterPassword: string, salt: string, iterations = authenticatorIterations): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey("raw", cryptoBytes(new TextEncoder().encode(masterPassword)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: cryptoBytes(base64ToBytes(salt)),
      iterations
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptJson(key: CryptoKey, value: unknown, iv = randomBytes(12)): Promise<{ iv: string; ciphertext: string }> {
  const encoded = cryptoBytes(new TextEncoder().encode(JSON.stringify(value)));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: cryptoBytes(iv) }, key, encoded));
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}

async function decryptJson<T>(key: CryptoKey, iv: string, ciphertext: string): Promise<T> {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: cryptoBytes(base64ToBytes(iv)) }, key, cryptoBytes(base64ToBytes(ciphertext)));
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

function isAuthenticatorVaultMeta(value: unknown): value is AuthenticatorVaultMeta {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthenticatorVaultMeta>;
  return (
    candidate.version === 1 &&
    candidate.kdf === "PBKDF2-HMAC-SHA-256" &&
    typeof candidate.iterations === "number" &&
    typeof candidate.salt === "string" &&
    typeof candidate.verifierIv === "string" &&
    typeof candidate.verifierCiphertext === "string"
  );
}

function normalizeEncryptedAuthenticatorRecords(value: unknown): EncryptedAuthenticatorRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Partial<EncryptedAuthenticatorRecord>;
      if (
        typeof row.id !== "string" ||
        typeof row.payloadIv !== "string" ||
        typeof row.payloadCiphertext !== "string" ||
        typeof row.sortOrder !== "number" ||
        typeof row.createdAt !== "string" ||
        typeof row.updatedAt !== "string"
      ) {
        return null;
      }
      return {
        id: row.id,
        payloadIv: row.payloadIv,
        payloadCiphertext: row.payloadCiphertext,
        sortOrder: row.sortOrder,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastUsedAt: typeof row.lastUsedAt === "string" ? row.lastUsedAt : null
      };
    })
    .filter(Boolean) as EncryptedAuthenticatorRecord[];
}

function isClipboardAction(action: string): boolean {
  const normalized = action.toLowerCase();
  return normalized.includes("copy") || normalized.includes("clipboard");
}

function emptyUsageSummary(backend: StorageBackend): UsageSummary {
  return {
    totalUsage: 0,
    todayUsage: 0,
    clipboardActions: 0,
    averageResponseMs: 0,
    toolCountTrendPercent: 0,
    todayUsageTrendPercent: 0,
    clipboardTrendPercent: 0,
    okCount: 0,
    warnCount: 0,
    errorCount: 0,
    recentToolCounts: [],
    toolCounts: [],
    backend
  };
}

async function db(): Promise<Database | null> {
  if (!isTauri()) return null;
  dbPromise ??= Database.load("sqlite:devforge.db");
  return dbPromise;
}

export async function listFavoriteTools(): Promise<ToolId[]> {
  const database = await db();
  if (!database) {
    if (fallbackFavorites.has(favoriteToolsKey)) return fallbackFavorites.get(favoriteToolsKey) ?? [];
    const stored = normalizeFavoriteTools(readLocalStorage<unknown>(favoriteToolsKey, []));
    fallbackFavorites.set(favoriteToolsKey, stored);
    return stored;
  }
  const rows = await database.select<Array<{ tool_id: string }>>(
    "SELECT tool_id FROM favorite_tools ORDER BY sort_order ASC, updated_at ASC"
  );
  return normalizeFavoriteTools(rows.map((row) => row.tool_id));
}

export async function addFavoriteTool(toolId: ToolId): Promise<void> {
  const now = nowIso();
  const database = await db();
  if (!database) {
    const current = await listFavoriteTools();
    if (current.includes(toolId)) return;
    const next = [...current, toolId];
    fallbackFavorites.set(favoriteToolsKey, next);
    writeLocalStorage(favoriteToolsKey, next);
    return;
  }
  await database.execute(
    "INSERT INTO favorite_tools(tool_id, sort_order, updated_at) VALUES ($1, COALESCE((SELECT MAX(sort_order) + 1 FROM favorite_tools), 0), $2) ON CONFLICT(tool_id) DO NOTHING",
    [toolId, now]
  );
}

export async function removeFavoriteTool(toolId: ToolId): Promise<void> {
  const database = await db();
  if (!database) {
    const next = (await listFavoriteTools()).filter((favoriteToolId) => favoriteToolId !== toolId);
    fallbackFavorites.set(favoriteToolsKey, next);
    writeLocalStorage(favoriteToolsKey, next);
    return;
  }
  await database.execute("DELETE FROM favorite_tools WHERE tool_id = $1", [toolId]);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const database = await db();
  if (!database) {
    if (fallbackSettings.has(key)) return fallbackSettings.get(key) as T;
    const stored = readLocalStorage(key, fallback);
    fallbackSettings.set(key, stored);
    return stored;
  }
  const rows = await database.select<Array<{ value_json: string }>>("SELECT value_json FROM app_settings WHERE key = $1", [key]);
  if (!rows[0]) return fallback;
  return JSON.parse(rows[0].value_json) as T;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const database = await db();
  if (!database) {
    fallbackSettings.set(key, value);
    writeLocalStorage(key, value);
    return;
  }
  await database.execute(
    "INSERT INTO app_settings(key, value_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
    [key, JSON.stringify(value), nowIso()]
  );
}

function normalizeTranslateCredentials(value: unknown): TranslateCredentials {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Partial<Record<Exclude<TranslateProviderId, "mymemory">, unknown>>;
  const credentials: TranslateCredentials = {};
  if (raw.baidu && typeof raw.baidu === "object") {
    const baidu = raw.baidu as Record<string, unknown>;
    if (typeof baidu.appId === "string" && typeof baidu.secretKey === "string") {
      credentials.baidu = { appId: baidu.appId, secretKey: baidu.secretKey };
    }
  }
  if (raw.azure && typeof raw.azure === "object") {
    const azure = raw.azure as Record<string, unknown>;
    if (typeof azure.key === "string" && typeof azure.region === "string") {
      credentials.azure = { key: azure.key, region: azure.region };
    }
  }
  if (raw.deepl && typeof raw.deepl === "object") {
    const deepl = raw.deepl as Record<string, unknown>;
    if (typeof deepl.authKey === "string") credentials.deepl = { authKey: deepl.authKey };
  }
  if (raw.google && typeof raw.google === "object") {
    const google = raw.google as Record<string, unknown>;
    if (typeof google.apiKey === "string") credentials.google = { apiKey: google.apiKey };
  }
  return credentials;
}

export async function getTranslateCredentials(): Promise<TranslateCredentials> {
  return normalizeTranslateCredentials(await getSetting<unknown>(translateCredentialsKey, {}));
}

export async function saveTranslateCredential(providerId: Exclude<TranslateProviderId, "mymemory">, credential: TranslateCredential): Promise<TranslateCredentials> {
  const current = await getTranslateCredentials();
  let next: TranslateCredentials;
  if (providerId === "baidu") {
    next = upsertTranslateCredential(current, providerId, credential as NonNullable<TranslateCredentials["baidu"]>);
  } else if (providerId === "azure") {
    next = upsertTranslateCredential(current, providerId, credential as NonNullable<TranslateCredentials["azure"]>);
  } else if (providerId === "deepl") {
    next = upsertTranslateCredential(current, providerId, credential as NonNullable<TranslateCredentials["deepl"]>);
  } else {
    next = upsertTranslateCredential(current, providerId, credential as NonNullable<TranslateCredentials["google"]>);
  }
  await setSetting(translateCredentialsKey, next);
  return next;
}

export async function deleteTranslateCredential(providerId: Exclude<TranslateProviderId, "mymemory">): Promise<TranslateCredentials> {
  const next = removeTranslateCredential(await getTranslateCredentials(), providerId);
  await setSetting(translateCredentialsKey, next);
  return next;
}

export async function getAuthenticatorVaultMeta(): Promise<AuthenticatorVaultMeta | null> {
  const database = await db();
  if (!database) {
    if (fallbackSettings.has(authenticatorVaultKey)) {
      const cached = fallbackSettings.get(authenticatorVaultKey);
      return isAuthenticatorVaultMeta(cached) ? cached : null;
    }
    const stored = readLocalStorage<unknown>(authenticatorVaultKey, null);
    const meta = isAuthenticatorVaultMeta(stored) ? stored : null;
    if (meta) fallbackSettings.set(authenticatorVaultKey, meta);
    return meta;
  }

  const rows = await database.select<Array<{ version: unknown; kdf: unknown; iterations: unknown; salt: string; verifier_iv: string; verifier_ciphertext: string }>>(
    "SELECT version, kdf, iterations, salt, verifier_iv, verifier_ciphertext FROM authenticator_vault WHERE id = 'default'"
  );
  const row = rows[0];
  if (!row) return null;
  return {
    version: 1,
    kdf: "PBKDF2-HMAC-SHA-256",
    iterations: toCount(row.iterations) || authenticatorIterations,
    salt: row.salt,
    verifierIv: row.verifier_iv,
    verifierCiphertext: row.verifier_ciphertext
  };
}

export async function createAuthenticatorVault(masterPassword: string): Promise<CryptoKey> {
  if (!masterPassword.trim()) throw new Error("请输入主密码");
  if (await getAuthenticatorVaultMeta()) throw new Error("2FA 保险库已存在");

  const salt = bytesToBase64(randomBytes(16));
  const key = await deriveAuthenticatorKey(masterPassword, salt);
  const verifier = await encryptJson(key, { ok: true, version: 1 });
  const meta: AuthenticatorVaultMeta = {
    version: 1,
    kdf: "PBKDF2-HMAC-SHA-256",
    iterations: authenticatorIterations,
    salt,
    verifierIv: verifier.iv,
    verifierCiphertext: verifier.ciphertext
  };
  const database = await db();
  if (!database) {
    fallbackSettings.set(authenticatorVaultKey, meta);
    fallbackAuthenticatorAccounts.splice(0);
    writeLocalStorage(authenticatorVaultKey, meta);
    writeLocalStorage(authenticatorAccountsKey, []);
    return key;
  }

  await database.execute(
    "INSERT INTO authenticator_vault(id, version, kdf, iterations, salt, verifier_iv, verifier_ciphertext, created_at, updated_at) VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $7)",
    [meta.version, meta.kdf, meta.iterations, meta.salt, meta.verifierIv, meta.verifierCiphertext, nowIso()]
  );
  return key;
}

export async function unlockAuthenticatorVault(masterPassword: string): Promise<CryptoKey> {
  const meta = await getAuthenticatorVaultMeta();
  if (!meta) throw new Error("尚未创建 2FA 保险库");
  const key = await deriveAuthenticatorKey(masterPassword, meta.salt, meta.iterations);
  try {
    await decryptJson<{ ok: boolean }>(key, meta.verifierIv, meta.verifierCiphertext);
  } catch {
    throw new Error("主密码不正确");
  }
  return key;
}

async function listEncryptedAuthenticatorRecords(): Promise<EncryptedAuthenticatorRecord[]> {
  const database = await db();
  if (!database) {
    if (fallbackAuthenticatorAccounts.length) return [...fallbackAuthenticatorAccounts].sort((a, b) => a.sortOrder - b.sortOrder);
    const stored = normalizeEncryptedAuthenticatorRecords(readLocalStorage<unknown>(authenticatorAccountsKey, []));
    fallbackAuthenticatorAccounts.splice(0, fallbackAuthenticatorAccounts.length, ...stored);
    return [...stored].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const rows = await database.select<
    Array<{
      id: string;
      payload_iv: string;
      payload_ciphertext: string;
      sort_order: unknown;
      created_at: string;
      updated_at: string;
      last_used_at: string | null;
    }>
  >("SELECT id, payload_iv, payload_ciphertext, sort_order, created_at, updated_at, last_used_at FROM totp_accounts ORDER BY sort_order ASC, created_at ASC");
  return rows.map((row) => ({
    id: row.id,
    payloadIv: row.payload_iv,
    payloadCiphertext: row.payload_ciphertext,
    sortOrder: toCount(row.sort_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at
  }));
}

export async function listAuthenticatorAccounts(vaultKey: CryptoKey): Promise<AuthenticatorAccount[]> {
  const records = await listEncryptedAuthenticatorRecords();
  const accounts = await Promise.all(
    records.map(async (record) => ({
      ...record,
      payload: normalizeTotpPayload(await decryptJson<TotpAccountPayload>(vaultKey, record.payloadIv, record.payloadCiphertext))
    }))
  );
  return accounts;
}

export async function saveAuthenticatorAccount(vaultKey: CryptoKey, payload: TotpAccountPayload, id?: string): Promise<EncryptedAuthenticatorRecord> {
  const normalized = normalizeTotpPayload(payload);
  const database = await db();
  const now = nowIso();
  const encrypted = await encryptJson(vaultKey, normalized);
  const currentRecords = await listEncryptedAuthenticatorRecords();
  const recordId = id ?? crypto.randomUUID();
  const existing = currentRecords.find((record) => record.id === recordId);
  const sortOrder = existing?.sortOrder ?? currentRecords.reduce((max, record) => Math.max(max, record.sortOrder), -1) + 1;
  const record: EncryptedAuthenticatorRecord = {
    id: recordId,
    payloadIv: encrypted.iv,
    payloadCiphertext: encrypted.ciphertext,
    sortOrder,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastUsedAt: existing?.lastUsedAt ?? null
  };

  if (!database) {
    const next = currentRecords.filter((item) => item.id !== recordId);
    next.push(record);
    next.sort((a, b) => a.sortOrder - b.sortOrder);
    fallbackAuthenticatorAccounts.splice(0, fallbackAuthenticatorAccounts.length, ...next);
    writeLocalStorage(authenticatorAccountsKey, next);
    return record;
  }

  await database.execute(
    "INSERT INTO totp_accounts(id, payload_iv, payload_ciphertext, sort_order, created_at, updated_at, last_used_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT(id) DO UPDATE SET payload_iv = excluded.payload_iv, payload_ciphertext = excluded.payload_ciphertext, sort_order = excluded.sort_order, updated_at = excluded.updated_at",
    [record.id, record.payloadIv, record.payloadCiphertext, record.sortOrder, record.createdAt, record.updatedAt, record.lastUsedAt]
  );
  return record;
}

export async function deleteAuthenticatorAccount(id: string): Promise<void> {
  const database = await db();
  if (!database) {
    const next = (await listEncryptedAuthenticatorRecords()).filter((record) => record.id !== id);
    fallbackAuthenticatorAccounts.splice(0, fallbackAuthenticatorAccounts.length, ...next);
    writeLocalStorage(authenticatorAccountsKey, next);
    return;
  }
  await database.execute("DELETE FROM totp_accounts WHERE id = $1", [id]);
}

export async function touchAuthenticatorAccount(id: string): Promise<void> {
  const database = await db();
  const now = nowIso();
  if (!database) {
    const next = (await listEncryptedAuthenticatorRecords()).map((record) => (record.id === id ? { ...record, lastUsedAt: now } : record));
    fallbackAuthenticatorAccounts.splice(0, fallbackAuthenticatorAccounts.length, ...next);
    writeLocalStorage(authenticatorAccountsKey, next);
    return;
  }
  await database.execute("UPDATE totp_accounts SET last_used_at = $1 WHERE id = $2", [now, id]);
}

export async function resetAuthenticatorVault(): Promise<void> {
  const database = await db();
  if (!database) {
    fallbackSettings.delete(authenticatorVaultKey);
    fallbackAuthenticatorAccounts.splice(0);
    window.localStorage.removeItem(`${localStoragePrefix}${authenticatorVaultKey}`);
    window.localStorage.removeItem(`${localStoragePrefix}${authenticatorAccountsKey}`);
    return;
  }
  await database.execute("DELETE FROM totp_accounts");
  await database.execute("DELETE FROM authenticator_vault WHERE id = 'default'");
}

async function getToolCountTrendPercent(database: Database | null): Promise<number> {
  const todayKey = localDateKey();
  const previousKey = localDateKey(-1);
  const currentToolCount = runnableTools.length;
  let snapshots: Record<string, number>;

  if (!database) {
    snapshots = normalizeToolCountSnapshots(readLocalStorage<unknown>(toolCountSnapshotsKey, {}));
    const previousToolCount = snapshots[previousKey] ?? currentToolCount;
    snapshots[todayKey] = currentToolCount;
    const recentSnapshots = Object.fromEntries(Object.entries(snapshots).sort(([a], [b]) => a.localeCompare(b)).slice(-14));
    writeLocalStorage(toolCountSnapshotsKey, recentSnapshots);
    fallbackSettings.set(toolCountSnapshotsKey, recentSnapshots);
    return percentChange(currentToolCount, previousToolCount);
  }

  const rows = await database.select<Array<{ value_json: string }>>("SELECT value_json FROM app_settings WHERE key = $1", [toolCountSnapshotsKey]);
  snapshots = normalizeToolCountSnapshots(rows[0] ? JSON.parse(rows[0].value_json) : {});
  const previousToolCount = snapshots[previousKey] ?? currentToolCount;
  snapshots[todayKey] = currentToolCount;
  const recentSnapshots = Object.fromEntries(Object.entries(snapshots).sort(([a], [b]) => a.localeCompare(b)).slice(-14));
  await database.execute(
    "INSERT INTO app_settings(key, value_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
    [toolCountSnapshotsKey, JSON.stringify(recentSnapshots), nowIso()]
  );
  return percentChange(currentToolCount, previousToolCount);
}

export async function recordUsage(entry: UsageDraft): Promise<void> {
  const now = nowIso();
  const inputPreview = entry.input ? preview(entry.input) : null;
  const outputPreview = entry.output ? preview(entry.output) : null;
  const inputBytes = byteSize(entry.input ?? "");
  const outputBytes = byteSize(entry.output ?? "");
  const database = await db();
  if (!database) {
    fallbackUsage.unshift({
      id: fallbackUsage.length + 1,
      tool_id: entry.toolId,
      action: entry.action,
      input_preview: inputPreview,
      output_preview: outputPreview,
      input_bytes: inputBytes,
      output_bytes: outputBytes,
      status: entry.status,
      created_at: now
    });
    fallbackUsage.splice(40);
    return;
  }
  await database.execute(
    "INSERT INTO tool_usage(tool_id, action, input_preview, output_preview, input_bytes, output_bytes, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [entry.toolId, entry.action, inputPreview, outputPreview, inputBytes, outputBytes, entry.status, now]
  );
}

export async function listUsage(limit = 12): Promise<UsageRecord[]> {
  const database = await db();
  if (!database) return fallbackUsage.slice(0, limit);
  return database.select<UsageRecord[]>(
    "SELECT id, tool_id, action, input_preview, output_preview, input_bytes, output_bytes, status, created_at FROM tool_usage ORDER BY created_at DESC LIMIT $1",
    [limit]
  );
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const startedAt = nowMs();
  const database = await db();
  const todayStart = startOfTodayIso();
  const yesterdayStart = startOfYesterdayIso();
  const recentWindowStart = recentWindowStartIso();
  const toolCountTrendPercent = await getToolCountTrendPercent(database);

  if (!database) {
    const summary = fallbackUsage.reduce(
      (current, item) => {
        current.totalUsage += 1;
        if (item.created_at >= todayStart) current.todayUsage += 1;
        if (isClipboardAction(item.action)) current.clipboardActions += 1;
        if (item.created_at >= yesterdayStart && item.created_at < todayStart) current.yesterdayUsage += 1;
        if (item.created_at >= todayStart && isClipboardAction(item.action)) current.todayClipboardActions += 1;
        if (item.created_at >= yesterdayStart && item.created_at < todayStart && isClipboardAction(item.action)) current.yesterdayClipboardActions += 1;
        if (item.status === "ok") current.okCount += 1;
        if (item.status === "warn") current.warnCount += 1;
        if (item.status === "error") current.errorCount += 1;

        const toolCount = current.toolCountMap.get(item.tool_id) ?? { tool_id: item.tool_id, count: 0, latest_at: null };
        toolCount.count += 1;
        if (!toolCount.latest_at || item.created_at > toolCount.latest_at) toolCount.latest_at = item.created_at;
        current.toolCountMap.set(item.tool_id, toolCount);

        if (item.created_at >= recentWindowStart) {
          const recentToolCount = current.recentToolCountMap.get(item.tool_id) ?? { tool_id: item.tool_id, count: 0, latest_at: null };
          recentToolCount.count += 1;
          if (!recentToolCount.latest_at || item.created_at > recentToolCount.latest_at) recentToolCount.latest_at = item.created_at;
          current.recentToolCountMap.set(item.tool_id, recentToolCount);
        }
        return current;
      },
      {
        ...emptyUsageSummary("fallback"),
        yesterdayUsage: 0,
        todayClipboardActions: 0,
        yesterdayClipboardActions: 0,
        toolCountMap: new Map<ToolId, ToolUsageCount>(),
        recentToolCountMap: new Map<ToolId, ToolUsageCount>()
      }
    );

    return {
      totalUsage: summary.totalUsage,
      todayUsage: summary.todayUsage,
      clipboardActions: summary.clipboardActions,
      averageResponseMs: nowMs() - startedAt,
      toolCountTrendPercent,
      todayUsageTrendPercent: percentChange(summary.todayUsage, summary.yesterdayUsage),
      clipboardTrendPercent: percentChange(summary.todayClipboardActions, summary.yesterdayClipboardActions),
      okCount: summary.okCount,
      warnCount: summary.warnCount,
      errorCount: summary.errorCount,
      recentToolCounts: Array.from(summary.recentToolCountMap.values()).sort(
        (a, b) => b.count - a.count || (b.latest_at ?? "").localeCompare(a.latest_at ?? "")
      ),
      toolCounts: Array.from(summary.toolCountMap.values()).sort((a, b) => b.count - a.count || (b.latest_at ?? "").localeCompare(a.latest_at ?? "")),
      backend: "fallback"
    };
  }

  const [aggregate] = await database.select<
    Array<{
      total_usage: unknown;
      today_usage: unknown;
      yesterday_usage: unknown;
      clipboard_actions: unknown;
      today_clipboard_actions: unknown;
      yesterday_clipboard_actions: unknown;
      ok_count: unknown;
      warn_count: unknown;
      error_count: unknown;
    }>
  >(
    `SELECT
      COUNT(*) AS total_usage,
      SUM(CASE WHEN created_at >= $1 THEN 1 ELSE 0 END) AS today_usage,
      SUM(CASE WHEN created_at >= $2 AND created_at < $1 THEN 1 ELSE 0 END) AS yesterday_usage,
      SUM(CASE WHEN lower(action) LIKE '%copy%' OR lower(action) LIKE '%clipboard%' THEN 1 ELSE 0 END) AS clipboard_actions,
      SUM(CASE WHEN created_at >= $1 AND (lower(action) LIKE '%copy%' OR lower(action) LIKE '%clipboard%') THEN 1 ELSE 0 END) AS today_clipboard_actions,
      SUM(CASE WHEN created_at >= $2 AND created_at < $1 AND (lower(action) LIKE '%copy%' OR lower(action) LIKE '%clipboard%') THEN 1 ELSE 0 END) AS yesterday_clipboard_actions,
      SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok_count,
      SUM(CASE WHEN status = 'warn' THEN 1 ELSE 0 END) AS warn_count,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
    FROM tool_usage`,
    [todayStart, yesterdayStart]
  );

  const toolRows = await database.select<Array<{ tool_id: string; count: unknown; latest_at: string | null }>>(
    "SELECT tool_id, COUNT(*) AS count, MAX(created_at) AS latest_at FROM tool_usage GROUP BY tool_id ORDER BY count DESC, latest_at DESC"
  );
  const recentToolRows = await database.select<Array<{ tool_id: string; count: unknown; latest_at: string | null }>>(
    "SELECT tool_id, COUNT(*) AS count, MAX(created_at) AS latest_at FROM tool_usage WHERE created_at >= $1 GROUP BY tool_id ORDER BY count DESC, latest_at DESC",
    [recentWindowStart]
  );

  return {
    totalUsage: toCount(aggregate?.total_usage),
    todayUsage: toCount(aggregate?.today_usage),
    clipboardActions: toCount(aggregate?.clipboard_actions),
    averageResponseMs: nowMs() - startedAt,
    toolCountTrendPercent,
    todayUsageTrendPercent: percentChange(toCount(aggregate?.today_usage), toCount(aggregate?.yesterday_usage)),
    clipboardTrendPercent: percentChange(toCount(aggregate?.today_clipboard_actions), toCount(aggregate?.yesterday_clipboard_actions)),
    okCount: toCount(aggregate?.ok_count),
    warnCount: toCount(aggregate?.warn_count),
    errorCount: toCount(aggregate?.error_count),
    recentToolCounts: recentToolRows
      .filter((row): row is { tool_id: ToolId; count: unknown; latest_at: string | null } => isToolId(row.tool_id))
      .map((row) => ({ tool_id: row.tool_id, count: toCount(row.count), latest_at: row.latest_at })),
    toolCounts: toolRows
      .filter((row): row is { tool_id: ToolId; count: unknown; latest_at: string | null } => isToolId(row.tool_id))
      .map((row) => ({ tool_id: row.tool_id, count: toCount(row.count), latest_at: row.latest_at })),
    backend: "sqlite"
  };
}
