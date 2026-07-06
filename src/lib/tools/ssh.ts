export type SshKeyAlgorithm = "rsa" | "ecdsa";
export type EcdsaCurve = "P-256" | "P-384" | "P-521";

export type SshKeyOptions = {
  algorithm: SshKeyAlgorithm;
  rsaBits: number;
  curve: EcdsaCurve;
  comment: string;
};

export type GeneratedSshKeyPair = {
  algorithm: SshKeyAlgorithm;
  label: string;
  publicKey: string;
  privateKey: string;
  fingerprint: string;
  comment: string;
  details: Array<{ label: string; value: string }>;
};

const curveToSshName: Record<EcdsaCurve, string> = {
  "P-256": "nistp256",
  "P-384": "nistp384",
  "P-521": "nistp521"
};

const curveToBits: Record<EcdsaCurve, number> = {
  "P-256": 256,
  "P-384": 384,
  "P-521": 521
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function pemWrap(label: string, bytes: Uint8Array): string {
  const base64 = toBase64(bytes);
  const lines = base64.match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function sshString(value: Uint8Array | string): Uint8Array {
  const bytes = typeof value === "string" ? utf8(value) : value;
  return concatBytes(uint32(bytes.length), bytes);
}

function sshMpint(value: Uint8Array): Uint8Array {
  const trimmedIndex = value.findIndex((byte) => byte !== 0);
  const trimmed = trimmedIndex === -1 ? new Uint8Array([0]) : value.slice(trimmedIndex);
  const prefixed = trimmed[0] & 0x80 ? concatBytes(new Uint8Array([0]), trimmed) : trimmed;
  return sshString(prefixed);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

export function normalizeSshComment(comment: string): string {
  return comment.trim().replace(/\s+/g, " ") || "devforge";
}

function publicKeyLine(type: string, wire: Uint8Array, comment: string): string {
  return `${type} ${toBase64(wire)} ${normalizeSshComment(comment)}`;
}

export function updateSshPublicKeyComment(publicKey: string, comment: string): string {
  const parts = publicKey.trim().split(/\s+/);
  if (parts.length < 2) return publicKey;
  return `${parts[0]} ${parts[1]} ${normalizeSshComment(comment)}`;
}

export function clampRsaBits(value: number): number {
  if (!Number.isFinite(value)) return 4096;
  const normalized = Math.trunc(value);
  if (normalized <= 2048) return 2048;
  if (normalized <= 3072) return 3072;
  return 4096;
}

export function sshPublicWireFromJwk(jwk: JsonWebKey, options: Pick<SshKeyOptions, "algorithm" | "curve">): { type: string; wire: Uint8Array } {
  if (options.algorithm === "rsa") {
    if (!jwk.e || !jwk.n) throw new Error("RSA 公钥缺少 e/n 参数");
    const type = "ssh-rsa";
    const exponent = fromBase64Url(jwk.e);
    const modulus = fromBase64Url(jwk.n);
    return {
      type,
      wire: concatBytes(sshString(type), sshMpint(exponent), sshMpint(modulus))
    };
  }

  if (!jwk.x || !jwk.y) throw new Error("ECDSA 公钥缺少 x/y 参数");
  const curveName = curveToSshName[options.curve];
  const type = `ecdsa-sha2-${curveName}`;
  const x = fromBase64Url(jwk.x);
  const y = fromBase64Url(jwk.y);
  const point = concatBytes(new Uint8Array([4]), x, y);
  return {
    type,
    wire: concatBytes(sshString(type), sshString(curveName), sshString(point))
  };
}

export async function sha256Fingerprint(wire: Uint8Array): Promise<string> {
  const input = wire.buffer.slice(wire.byteOffset, wire.byteOffset + wire.byteLength) as ArrayBuffer;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return `SHA256:${toBase64(digest).replace(/=+$/g, "")}`;
}

export async function generateSshKeyPair(options: SshKeyOptions): Promise<GeneratedSshKeyPair> {
  const comment = normalizeSshComment(options.comment);
  const keyPair =
    options.algorithm === "rsa"
      ? await crypto.subtle.generateKey(
          {
            name: "RSASSA-PKCS1-v1_5",
            modulusLength: clampRsaBits(options.rsaBits),
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256"
          },
          true,
          ["sign", "verify"]
        )
      : await crypto.subtle.generateKey(
          {
            name: "ECDSA",
            namedCurve: options.curve
          },
          true,
          ["sign", "verify"]
        );

  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privatePkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  const { type, wire } = sshPublicWireFromJwk(publicJwk, options);
  const publicKey = publicKeyLine(type, wire, comment);
  const fingerprint = await sha256Fingerprint(wire);
  const label = options.algorithm === "rsa" ? `RSA ${clampRsaBits(options.rsaBits)}` : `ECDSA ${curveToSshName[options.curve]}`;

  return {
    algorithm: options.algorithm,
    label,
    publicKey,
    privateKey: pemWrap("PRIVATE KEY", privatePkcs8),
    fingerprint,
    comment,
    details:
      options.algorithm === "rsa"
        ? [
            { label: "算法", value: "RSA" },
            { label: "长度", value: `${clampRsaBits(options.rsaBits)} bit` },
            { label: "格式", value: "OpenSSH / PKCS#8" }
          ]
        : [
            { label: "算法", value: "ECDSA" },
            { label: "曲线", value: curveToSshName[options.curve] },
            { label: "强度", value: `${curveToBits[options.curve]} bit` }
          ]
  };
}
