const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type JwtAlg = "HS256" | "HS384" | "HS512" | "none" | string;

export interface DecodedJwt {
  ok: boolean;
  token: string;
  parts: string[];
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  error?: string;
}

function base64UrlEncodeBytes(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlEncodeText(value: string): string {
  return base64UrlEncodeBytes(encoder.encode(value));
}

function base64UrlDecodeToBytes(value: string): Uint8Array {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlDecodeText(value: string): string {
  return decoder.decode(base64UrlDecodeToBytes(value));
}

function hmacHashName(alg: JwtAlg): string | null {
  return { HS256: "SHA-256", HS384: "SHA-384", HS512: "SHA-512" }[alg] ?? null;
}

export async function signJwtData(alg: JwtAlg, secret: string, data: string): Promise<string> {
  if (alg === "none") return "";
  const hash = hmacHashName(alg);
  if (!hash) return "";
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64UrlEncodeBytes(signature);
}

export function decodeJwt(token: string): DecodedJwt {
  try {
    const trimmed = token.trim();
    const parts = trimmed.split(".");
    if (parts.length !== 3 || !parts[0] || !parts[1]) throw new Error("JWT 必须由 header.payload.signature 三段组成");
    const header = JSON.parse(base64UrlDecodeText(parts[0])) as Record<string, unknown>;
    const payload = JSON.parse(base64UrlDecodeText(parts[1])) as Record<string, unknown>;
    if (!parts[2] && header.alg !== "none") throw new Error("签名段为空，仅 alg=none 时有效");
    return { ok: true, token: trimmed, parts, header, payload, signature: parts[2] };
  } catch (error) {
    return {
      ok: false,
      token,
      parts: [],
      header: {},
      payload: {},
      signature: "",
      error: error instanceof Error ? error.message : "JWT 解析失败"
    };
  }
}

export async function verifyJwt(token: string, secret: string) {
  const decoded = decodeJwt(token);
  if (!decoded.ok) return { ok: false, supported: false, message: decoded.error ?? "JWT 解析失败", decoded };
  const alg = String(decoded.header.alg ?? "");
  const expected = await signJwtData(alg, secret, `${decoded.parts[0]}.${decoded.parts[1]}`);
  if (!expected) {
    return { ok: false, supported: false, message: `${alg || "未知算法"} 需要公钥或不属于 HMAC 系列，本页面仅解码展示。`, decoded };
  }
  const ok = expected === decoded.parts[2];
  return { ok, supported: true, message: ok ? "Header + Payload 与 Secret 匹配。" : "请检查 Secret、算法或 Token 是否被改动。", decoded };
}

export async function encodeJwt(headerSource: string, payloadSource: string, alg: JwtAlg, secret: string) {
  const header = JSON.parse(headerSource) as Record<string, unknown>;
  const payload = JSON.parse(payloadSource) as Record<string, unknown>;
  header.alg = alg;
  header.typ ??= "JWT";
  const headerPart = base64UrlEncodeText(JSON.stringify(header));
  const payloadPart = base64UrlEncodeText(JSON.stringify(payload));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = await signJwtData(alg, secret, signingInput);
  return `${signingInput}.${signature}`;
}

export function formatUnixTime(value: unknown): string {
  if (!Number.isFinite(Number(value))) return "-";
  return new Date(Number(value) * 1000).toLocaleString();
}

export function registeredClaims(payload: Record<string, unknown>) {
  return [
    ["iss", payload.iss || "-"],
    ["sub", payload.sub || "-"],
    ["aud", Array.isArray(payload.aud) ? payload.aud.join(", ") : payload.aud || "-"],
    ["iat", payload.iat ? formatUnixTime(payload.iat) : "-"],
    ["nbf", payload.nbf ? formatUnixTime(payload.nbf) : "-"],
    ["exp", payload.exp ? formatUnixTime(payload.exp) : "-"]
  ] as Array<[string, string | unknown]>;
}

export const sampleJwtHeader = { alg: "HS256", typ: "JWT" };
export const sampleJwtPayload = {
  sub: "devforge-user",
  name: "DevForge",
  iat: 1718000000,
  exp: 1924992000,
  roles: ["admin", "developer"]
};
