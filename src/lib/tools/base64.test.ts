import { describe, expect, it } from "vitest";
import { transformBase64 } from "./base64";

describe("Base64 transform", () => {
  it("encodes and decodes unicode text", () => {
    const encoded = transformBase64("开发者工具", { mode: "encode", urlSafe: false, lineWrap: false, padding: true });
    expect(encoded.ok).toBe(true);
    const decoded = transformBase64(encoded.output, { mode: "decode", urlSafe: false, lineWrap: false, padding: true });
    expect(decoded.output).toBe("开发者工具");
  });

  it("reports malformed input", () => {
    const result = transformBase64("%", { mode: "decode", urlSafe: false, lineWrap: false, padding: true });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("无法解码");
  });

  it("supports URL safe without padding", () => {
    const result = transformBase64("hello?", { mode: "encode", urlSafe: true, lineWrap: false, padding: false });
    expect(result.output).not.toContain("=");
    expect(result.output).not.toContain("+");
  });
});
