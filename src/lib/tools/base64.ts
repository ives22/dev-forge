import { byteSize, formatBytes } from "../utils";

export type Base64Mode = "encode" | "decode";

export interface Base64Options {
  mode: Base64Mode;
  urlSafe: boolean;
  lineWrap: boolean;
  padding: boolean;
}

export interface Base64Result {
  ok: boolean;
  output: string;
  error?: string;
  inputBytes: number;
  outputBytes: number;
  ratio: string;
  variant: string;
  padding: string;
  wrap: string;
}

function binaryFromUtf8(value: string): string {
  return Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join("");
}

function utf8FromBinary(value: string): string {
  const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function toUrlSafe(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_");
}

function fromUrlSafe(value: string): string {
  return value.replace(/-/g, "+").replace(/_/g, "/");
}

function addPadding(value: string): string {
  const missing = (4 - (value.length % 4)) % 4;
  return `${value}${"=".repeat(missing)}`;
}

function wrapLines(value: string): string {
  return value.replace(/(.{76})/g, "$1\n").trim();
}

function compact(value: string): string {
  return value.replace(/\s+/g, "");
}

export function transformBase64(input: string, options: Base64Options): Base64Result {
  const inputBytes = byteSize(input);
  try {
    let output = "";
    if (options.mode === "encode") {
      output = btoa(binaryFromUtf8(input));
      if (options.urlSafe) output = toUrlSafe(output);
      if (!options.padding) output = output.replace(/=+$/g, "");
      if (options.lineWrap) output = wrapLines(output);
    } else {
      let normalized = compact(input);
      const dataUriMatch = normalized.match(/^data:[^,]+,([A-Za-z0-9+/=_-]+)$/);
      if (dataUriMatch) normalized = dataUriMatch[1];
      if (options.urlSafe) normalized = fromUrlSafe(normalized);
      normalized = addPadding(normalized);
      output = utf8FromBinary(atob(normalized));
    }
    const outputBytes = byteSize(output);
    return {
      ok: true,
      output,
      inputBytes,
      outputBytes,
      ratio: inputBytes ? `${Math.round((outputBytes / inputBytes) * 100)}%` : "0%",
      variant: options.urlSafe ? "URL Safe" : "Standard",
      padding: options.padding ? "保留" : "移除",
      wrap: options.lineWrap ? "76 cols" : "单行"
    };
  } catch {
    return {
      ok: false,
      output: "",
      error: "无法解码：请检查 Base64 字符、padding 或 URL Safe 选项",
      inputBytes,
      outputBytes: 0,
      ratio: "0%",
      variant: options.urlSafe ? "URL Safe" : "Standard",
      padding: options.padding ? "保留" : "移除",
      wrap: options.lineWrap ? "76 cols" : "单行"
    };
  }
}

export function base64Metrics(result: Base64Result) {
  return {
    input: formatBytes(result.inputBytes),
    output: formatBytes(result.outputBytes),
    ratio: result.ratio
  };
}
