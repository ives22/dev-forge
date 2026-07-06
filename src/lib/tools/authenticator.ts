export type TotpAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

export type TotpAccountPayload = {
  issuer: string;
  accountName: string;
  secret: string;
  algorithm: TotpAlgorithm;
  digits: 6 | 8;
  period: 15 | 30 | 60;
};

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const supportedAlgorithms: Record<string, TotpAlgorithm> = {
  SHA1: "SHA-1",
  "SHA-1": "SHA-1",
  SHA256: "SHA-256",
  "SHA-256": "SHA-256",
  SHA512: "SHA-512",
  "SHA-512": "SHA-512"
};

const exportAlgorithms: Record<TotpAlgorithm, string> = {
  "SHA-1": "SHA1",
  "SHA-256": "SHA256",
  "SHA-512": "SHA512"
};

export const defaultTotpAccount: Pick<TotpAccountPayload, "algorithm" | "digits" | "period"> = {
  algorithm: "SHA-1",
  digits: 6,
  period: 30
};

function normalizeBase32(value: string): string {
  return value.replace(/[\s=-]/g, "").toUpperCase();
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20"));
  } catch {
    return value;
  }
}

function numberParam(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bytesToCounter(value: number): Uint8Array {
  const counter = Math.floor(value);
  const output = new Uint8Array(8);
  let remaining = BigInt(counter);
  for (let index = 7; index >= 0; index -= 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

function cryptoBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

export function base32ToBytes(value: string): Uint8Array {
  const normalized = normalizeBase32(value);
  if (!normalized) throw new Error("缺少 TOTP secret");

  let bits = "";
  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char);
    if (index < 0) throw new Error("密钥包含非法 Base32 字符");
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return new Uint8Array(bytes);
}

export function normalizeTotpPayload(payload: TotpAccountPayload): TotpAccountPayload {
  const issuer = payload.issuer.trim();
  const accountName = payload.accountName.trim();
  const secret = normalizeBase32(payload.secret);
  if (!issuer) throw new Error("请输入服务商");
  if (!accountName) throw new Error("请输入账号");
  base32ToBytes(secret);
  if (![6, 8].includes(payload.digits)) throw new Error("验证码位数仅支持 6 或 8");
  if (![15, 30, 60].includes(payload.period)) throw new Error("刷新周期仅支持 15、30 或 60 秒");
  return {
    issuer,
    accountName,
    secret,
    algorithm: payload.algorithm,
    digits: payload.digits,
    period: payload.period
  };
}

export function parseOtpAuthUri(value: string): TotpAccountPayload {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("无效的 otpauth URI");
  }

  if (url.protocol !== "otpauth:") throw new Error("只支持 otpauth:// 协议");
  if (url.hostname.toLowerCase() !== "totp") {
    if (url.hostname.toLowerCase() === "hotp") throw new Error("暂不支持 HOTP");
    throw new Error("不支持该 OTP 类型");
  }

  const secret = url.searchParams.get("secret");
  if (!secret) throw new Error("缺少 TOTP secret");

  const label = safeDecode(url.pathname.replace(/^\/+/, ""));
  const [labelIssuer, ...accountParts] = label.split(":");
  const uriIssuer = url.searchParams.get("issuer") ? safeDecode(url.searchParams.get("issuer") ?? "") : "";
  const issuer = uriIssuer || (accountParts.length ? labelIssuer : "");
  const accountName = accountParts.length ? accountParts.join(":") : labelIssuer;
  const algorithmInput = (url.searchParams.get("algorithm") || "SHA1").toUpperCase();
  const algorithm = supportedAlgorithms[algorithmInput];
  if (!algorithm) throw new Error("哈希算法仅支持 SHA1、SHA256 或 SHA512");

  const digits = numberParam(url.searchParams.get("digits"), defaultTotpAccount.digits);
  if (digits !== 6 && digits !== 8) throw new Error("验证码位数仅支持 6 或 8");

  const period = numberParam(url.searchParams.get("period"), defaultTotpAccount.period);
  if (period !== 15 && period !== 30 && period !== 60) throw new Error("刷新周期仅支持 15、30 或 60 秒");

  return normalizeTotpPayload({
    issuer,
    accountName,
    secret,
    algorithm,
    digits,
    period
  });
}

export function totpPayloadToOtpAuthUri(payload: TotpAccountPayload): string {
  const normalized = normalizeTotpPayload(payload);
  const label = `${normalized.issuer}:${normalized.accountName}`;
  const params = new URLSearchParams({
    secret: normalized.secret,
    issuer: normalized.issuer,
    algorithm: exportAlgorithms[normalized.algorithm],
    digits: String(normalized.digits),
    period: String(normalized.period)
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function extractOtpAuthUrisFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function generateTotpCode(payload: Pick<TotpAccountPayload, "secret" | "algorithm" | "digits" | "period">, nowMs = Date.now()): Promise<string> {
  const secretBytes = base32ToBytes(payload.secret);
  const counter = bytesToCounter(Math.floor(nowMs / 1000 / payload.period));
  const key = await crypto.subtle.importKey("raw", cryptoBytes(secretBytes), { name: "HMAC", hash: payload.algorithm }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, cryptoBytes(counter)));
  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);
  const modulo = 10 ** payload.digits;
  return String(binary % modulo).padStart(payload.digits, "0");
}

export function remainingTotpSeconds(period: number, nowMs = Date.now()): number {
  const elapsed = Math.floor(nowMs / 1000) % period;
  return elapsed === 0 ? period : period - elapsed;
}

export function formatTotpCode(value: string): string {
  if (value.length === 8) return `${value.slice(0, 4)} ${value.slice(4)}`;
  if (value.length === 6) return `${value.slice(0, 3)} ${value.slice(3)}`;
  return value;
}
